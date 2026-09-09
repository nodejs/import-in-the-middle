// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

'use strict'

import { builtinModules } from 'module'
import { URL } from 'url'

import { getExports } from './get-exports.mjs'
import { RESOLVE } from './io.mjs'

// Depth at which `processModule` starts tracking visited URLs to break an
// `export *` cycle. Real re-export chains are only a few levels deep, so this
// is far beyond any legitimate graph yet well below the call-stack limit a
// cycle would otherwise hit. Below it the recursion pays only an integer
// compare per level and allocates no set.
const STAR_CYCLE_DEPTH = 100
const IDENTIFIER_NAME_REGEXP = /^[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*$/u

/** @typedef {{ name: string, origin: string }} StarBinding */
/** @typedef {{ name: string, url: string, localName?: string }} ResolvedExportBinding */
/**
 * @typedef {object} ExportDeclaration
 * @property {'direct' | 'reexport'} type
 * @property {string} name
 * @property {string} [localName]
 * @property {string} [importName]
 * @property {string} [specifier]
 */
/**
 * @typedef {object} ModuleExportsMetadata
 * @property {Iterable<string>} exportNames
 * @property {Map<string, ExportDeclaration>} [exportDeclarations]
 * @property {Array<{ specifier: string, parentURL: string }>} [starReexports]
 */
/**
 * @typedef {object} ProcessResult
 * @property {string[] | Map<string, string | StarBinding>} bindings
 * @property {Map<string, string> | undefined} origins
 */

function isBareSpecifier (specifier) {
  // Relative and absolute paths are not bare specifiers.
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/')) {
    return false
  }

  // Valid URLs are not bare specifiers. (file:, http:, node:, etc.)

  // eslint-disable-next-line no-prototype-builtins
  if (URL.hasOwnProperty('canParse')) {
    return !URL.canParse(specifier)
  }

  const stackTraceLimit = Error.stackTraceLimit
  try {
    Error.stackTraceLimit = 0
    // eslint-disable-next-line no-new
    new URL(specifier)
    return false
  } catch {
    return true
  } finally {
    Error.stackTraceLimit = stackTraceLimit
  }
}

/**
 * @param {string} name The exported name.
 * @param {string} sourceUrl The URL of the module that defines the export.
 */
function shouldReexport (name, sourceUrl) {
  return name !== 'module.exports' ||
    (!sourceUrl.startsWith('node:') && !builtinModules.includes(sourceUrl))
}

/**
 * @param {string} name The exported name.
 * @param {string} sourceUrl The URL of the module that defines the export.
 */
function shouldExcludeExport (name, sourceUrl) {
  return name === 'default' || !shouldReexport(name, sourceUrl)
}

/**
 * Processes a module's exports and builds its wrapper bindings.
 *
 * Written as a "sans-io" generator (see `lib/io.mjs`): instead of calling the
 * loader's resolve/load hooks directly it `yield`s `[RESOLVE, ...]` to resolve
 * star re-exports and `[LOAD, ...]` (via {@link getExports}) to read source,
 * and is driven by either {@link driveSync} (for
 * `module.registerHooks`) or {@link driveAsync} (for `module.register`). The
 * body is identical for both, so there is a single implementation to maintain.
 *
 * @param {object} params
 * @param {string} params.srcUrl The full URL to the module to process.
 * @param {LoadContext} params.context Provided by the loaders API.
 * @param {boolean} [params.excludeDefault = false] Exclude the default export.
 * @param {number} [params.depth = 0] Star-re-export recursion depth. Used to
 * detect `export *` cycles (`a` re-exports `b`, `b` re-exports `a`) cheaply:
 * the acyclic common case pays only an integer compare per level, and the
 * cycle-tracking set is allocated only once recursion is implausibly deep.
 * @param {Set<string>} [params.seen] URLs currently on the recursion stack,
 * created lazily once `depth` crosses {@link STAR_CYCLE_DEPTH}. A URL is added
 * before descending into its subtree and removed once that subtree finishes, so
 * it tracks the active path rather than every URL ever visited.
 * @param {Map<string, ModuleExportsMetadata>} [params.moduleExportsCache] Parsed exports used by binding resolution.
 * @returns {Generator<Array, ProcessResult>}
 * A generator that yields I/O operations and ultimately returns the shimmed
 * bindings for all the exports from the module and any transitive export all
 * modules. `origins` (the defining module per `*`-sourced name) is `undefined`
 * for a module with no `export *`.
 */
export function * processModule ({
  srcUrl,
  context,
  excludeDefault = false,
  depth = 0,
  seen,
  moduleExportsCache
}) {
  const moduleExports = yield * getExports(srcUrl, context, moduleExportsCache !== undefined)
  if (moduleExportsCache !== undefined) moduleExportsCache.set(srcUrl, moduleExports)
  const { exportNames, starReexports } = moduleExports

  // Most modules have no export star. Keep that path array-backed so it pays
  // neither merge bookkeeping nor a Map lookup for each direct export.
  if (starReexports === undefined) {
    if (!excludeDefault) {
      return { bindings: exportNames, origins: undefined }
    }

    const bindings = []
    for (const name of exportNames) {
      if (shouldExcludeExport(name, srcUrl)) continue
      bindings.push(name)
    }
    return { bindings, origins: undefined }
  }

  const bindings = new Map()

  // Maps each live `*`-sourced name to the module that defined it. Its keys
  // double as "this name came from a `*` re-export" (so an explicit export can
  // override it), and its values let two `*` re-exports of the same name be told
  // apart. Allocated on the first `export *`, never for a module without one; a
  // single Map carries both facts so a star with no collision pays one structure
  // and one write per name, not two.
  let starOrigins
  let ambiguousStars
  let firstStarUrl
  let processedStarUrls

  for (const name of exportNames) {
    if (excludeDefault && shouldExcludeExport(name, srcUrl)) continue
    bindings.set(name, name)
  }

  for (const { specifier, parentURL } of starReexports) {
    // Relative paths need to be resolved relative to the module declaring the star.
    const newSpecifier = isBareSpecifier(specifier) ? specifier : new URL(specifier, parentURL).href
    // We need to resolve bare specifiers to a full URL. We also need to
    // resolve all sub-modules to get the `format`. We can't rely on the
    // parent's `format` to know if this sub-module is ESM or CJS!
    const result = yield [RESOLVE, newSpecifier, { parentURL }]

    // Most star modules have one target. Defer the collection until a second
    // distinct target while still ignoring repeated declarations.
    if (firstStarUrl === undefined) {
      firstStarUrl = result.url
    } else if (processedStarUrls === undefined) {
      if (result.url === firstStarUrl) continue
      processedStarUrls = [firstStarUrl, result.url]
    } else {
      if (processedStarUrls.includes(result.url)) continue
      processedStarUrls.push(result.url)
    }

    // First `*` re-export: allocate the origin bookkeeping lazily.
    starOrigins ??= new Map()

    // `export *` graphs are normally only a handful of levels deep. A cycle
    // (`a` re-exports `b`, `b` re-exports `a`) instead recurses without bound
    // and exhausts memory. Rather than track every URL on the common shallow
    // path, only start recording once the depth is implausibly large for a
    // real graph; from there a re-export pointing back at a module already on
    // the recursion stack is the cycle, and is skipped (its exports are
    // collected by the in-progress ancestor frame). `seen` mirrors the stack,
    // not every URL visited: a module reached and fully processed through one
    // sibling branch must stay reachable through a later, more direct branch,
    // so it is removed again once its subtree finishes.
    if (depth >= STAR_CYCLE_DEPTH) {
      seen ??= new Set()
      if (seen.has(result.url)) continue
      seen.add(result.url)
    }

    try {
      const sub = yield * processModule({
        srcUrl: result.url,
        context: { ...context, format: result.format },
        excludeDefault: true,
        depth: depth + 1,
        seen,
        moduleExportsCache
      })

      for (const binding of sub.bindings.values()) {
        const directName = typeof binding === 'string' ? binding : undefined
        const name = directName ?? binding.name
        if (ambiguousStars?.has(name)) continue

        const origin = directName === undefined ? binding.origin : sub.origins?.get(name) ?? result.url
        if (bindings.has(name)) {
          // An explicit export shadows every star re-export.
          if (!starOrigins.has(name)) continue

          if (starOrigins.get(name) === origin) {
            // IITM's aggregate namespace sees the wrapped paths as ambiguous.
            // Retain the defining URL so source generation can import it once.
            bindings.set(name, { name, origin })
          } else {
            bindings.delete(name)
            starOrigins.delete(name)
            ambiguousStars ??= new Set()
            ambiguousStars.add(name)
          }
        } else {
          starOrigins.set(name, origin)
          bindings.set(name, binding)
        }
      }
    } finally {
      seen?.delete(result.url)
    }
  }

  return { bindings, origins: starOrigins }
}

/**
 * Resolves exported names to the local bindings that define them.
 *
 * @param {object} params
 * @param {string} params.srcUrl The root module URL.
 * @param {object} params.context The root module load context.
 * @param {Iterable<string>} params.exportNames The root module's resolved export names.
 * @param {Map<string, ModuleExportsMetadata>} params.moduleExportsCache Parsed exports collected during graph traversal.
 * @returns {Generator<Array, ResolvedExportBinding[]>}
 */
export function * resolveExportBindings ({ srcUrl, context, exportNames, moduleExportsCache }) {
  const memo = new Map()
  const pending = new Set()
  const resolutionCache = new Map()
  const bindings = []
  for (const name of exportNames) {
    const binding = yield * resolveExportBinding({
      srcUrl,
      name,
      context,
      moduleExportsCache,
      memo,
      pending,
      resolutionCache
    })
    bindings.push(binding ?? { name, url: srcUrl })
  }
  return bindings
}

/**
 * @param {object} params
 * @param {string} params.srcUrl The module URL.
 * @param {string} params.name The exported name to resolve.
 * @param {object} params.context The module load context.
 * @param {Map<string, ModuleExportsMetadata>} params.moduleExportsCache Parsed module exports.
 * @param {Map<string, ResolvedExportBinding | false>} params.memo Resolved bindings by module and export name.
 * @param {Set<string>} params.pending Bindings on the active resolution path.
 * @param {Map<string, { url: string, format?: string }>} params.resolutionCache Resolved re-export targets.
 * @returns {Generator<Array, ResolvedExportBinding | undefined>}
 */
function * resolveExportBinding ({ srcUrl, name, context, moduleExportsCache, memo, pending, resolutionCache }) {
  const key = `${srcUrl}\0${name}`
  if (memo.has(key)) {
    const binding = memo.get(key)
    return binding === false ? undefined : binding
  }
  if (pending.has(key)) return
  pending.add(key)

  let binding
  try {
    const moduleExports = yield * loadModuleExports(srcUrl, context, moduleExportsCache)
    const declaration = moduleExports.exportDeclarations?.get(name)
    if (declaration?.type === 'direct') {
      binding = { name, url: srcUrl }
      if (declaration.localName !== undefined) binding.localName = declaration.localName
    } else if (declaration?.type === 'reexport' && declaration.specifier !== undefined) {
      const target = yield * resolveBindingTarget(declaration.specifier, srcUrl, resolutionCache)
      if (declaration.importName === undefined) {
        binding = { name, url: target.url }
      } else {
        const imported = yield * resolveExportBinding({
          srcUrl: target.url,
          name: declaration.importName,
          context: { ...context, format: target.format },
          moduleExportsCache,
          memo,
          pending,
          resolutionCache
        })
        if (imported !== undefined) binding = { ...imported, name }
      }
    } else if (name !== 'default' && moduleExports.starReexports !== undefined) {
      binding = yield * resolveStarExport({
        name,
        context,
        starReexports: moduleExports.starReexports,
        moduleExportsCache,
        memo,
        pending,
        resolutionCache
      })
    } else if (hasExportName(moduleExports.exportNames, name)) {
      binding = { name, url: srcUrl }
    }
  } finally {
    pending.delete(key)
  }

  memo.set(key, binding ?? false)
  return binding
}

/**
 * @param {object} params
 * @param {string} params.name The star-exported name to resolve.
 * @param {object} params.context The parent module load context.
 * @param {Array<{ specifier: string, parentURL: string }>} params.starReexports Star re-export declarations.
 * @param {Map<string, ModuleExportsMetadata>} params.moduleExportsCache Parsed module exports.
 * @param {Map<string, ResolvedExportBinding | false>} params.memo Resolved bindings by module and export name.
 * @param {Set<string>} params.pending Bindings on the active resolution path.
 * @param {Map<string, { url: string, format?: string }>} params.resolutionCache Resolved re-export targets.
 * @returns {Generator<Array, ResolvedExportBinding | undefined>}
 */
function * resolveStarExport ({ name, context, starReexports, moduleExportsCache, memo, pending, resolutionCache }) {
  let binding
  for (const { specifier, parentURL } of starReexports) {
    const target = yield * resolveBindingTarget(specifier, parentURL, resolutionCache)
    const candidate = yield * resolveExportBinding({
      srcUrl: target.url,
      name,
      context: { ...context, format: target.format },
      moduleExportsCache,
      memo,
      pending,
      resolutionCache
    })
    if (candidate === undefined) continue
    if (binding === undefined) {
      binding = candidate
    } else if (binding.url !== candidate.url || binding.localName !== candidate.localName) {
      return
    }
  }
  return binding === undefined ? undefined : { ...binding, name }
}

/**
 * @param {string} specifier The re-exported module specifier.
 * @param {string} parentURL The declaring module URL.
 * @param {Map<string, { url: string, format?: string }>} resolutionCache Resolved re-export targets.
 * @returns {Generator<Array, { url: string, format?: string }>}
 */
function * resolveBindingTarget (specifier, parentURL, resolutionCache) {
  const key = `${parentURL}\0${specifier}`
  const cached = resolutionCache.get(key)
  if (cached !== undefined) return cached

  const request = isBareSpecifier(specifier) ? specifier : new URL(specifier, parentURL).href
  const target = yield [RESOLVE, request, { parentURL }]
  resolutionCache.set(key, target)
  return target
}

/**
 * @param {string} srcUrl The module URL.
 * @param {object} context The module load context.
 * @param {Map<string, ModuleExportsMetadata>} moduleExportsCache Parsed module exports.
 * @returns {Generator<Array, ModuleExportsMetadata>}
 */
function * loadModuleExports (srcUrl, context, moduleExportsCache) {
  let moduleExports = moduleExportsCache.get(srcUrl)
  if (moduleExports === undefined) {
    moduleExports = yield * getExports(srcUrl, context, true)
    moduleExportsCache.set(srcUrl, moduleExports)
  }
  return moduleExports
}

/**
 * @param {Iterable<string>} exportNames The module's exported names.
 * @param {string} name The expected export name.
 * @returns {boolean}
 */
function hasExportName (exportNames, name) {
  for (const exportName of exportNames) {
    if (exportName === name) return true
  }
  return false
}

/**
 * @typedef {object} WrapperOptions
 * @property {string} realUrl The URL of the wrapped module.
 * @property {string[] | Map<string, string | StarBinding>} bindings Its exported bindings.
 * @property {string} originalSpecifier The specifier used to import the module.
 * @property {string} runtimeSpecifier The wrapper runtime import.
 * @property {(url: string) => string} [mapImport] Maps module URLs to bundler-owned imports.
 * @property {ReadonlySet<string>} [passthroughExports] Exports that retain their source bindings.
 */

/**
 * @param {WrapperOptions & { data?: unknown }} options
 * @param {boolean} withData Whether to use the extended bundler registry.
 * @returns {string}
 */
function buildESMWrapperSource ({
  realUrl,
  bindings,
  originalSpecifier,
  data,
  runtimeSpecifier,
  mapImport,
  passthroughExports
}, withData) {
  const moduleSpecifier = mapImport?.(realUrl) ?? realUrl
  // The wrapped module imports its namespace as `namespace`, which serves
  // every export but the ones a same-origin `export *` collision forced onto
  // their defining module (#171): the aggregate namespace drops those as
  // ambiguous under iitm, so each such defining module gets its own alias the
  // wrapper imports. Without such a collision nothing is added.
  let originImports = ''
  let originNamespaces
  let declarationNames = ''
  let bindingNames = ''
  let bindingSources
  let exportSpecifiers = ''
  let passthroughNames = ''
  let passthroughReexports = ''
  let passthroughSources
  let passthroughIndex = 0
  let writeCases = ''
  let index = 0
  for (const binding of bindings.values()) {
    const directName = typeof binding === 'string' ? binding : undefined
    const name = directName ?? binding.name
    let namespaceName = 'namespace'
    let sourceSpecifier = moduleSpecifier
    if (directName === undefined) {
      originNamespaces ??= new Map()
      namespaceName = originNamespaces.get(binding.origin)
      if (namespaceName === undefined) {
        namespaceName = `__ns${originNamespaces.size}`
        originNamespaces.set(binding.origin, namespaceName)
        const originSpecifier = mapImport?.(binding.origin) ?? binding.origin
        originImports += `import * as ${namespaceName} from ${JSON.stringify(originSpecifier)}\n`
        sourceSpecifier = originSpecifier
      } else {
        sourceSpecifier = mapImport?.(binding.origin) ?? binding.origin
      }
    }
    const objectKey = JSON.stringify(name)
    const exportName = IDENTIFIER_NAME_REGEXP.test(name) ? name : objectKey
    if (passthroughExports?.has(name)) {
      passthroughNames += passthroughNames === '' ? objectKey : `, ${objectKey}`
      if (passthroughSources !== undefined) passthroughSources += ', '
      if (namespaceName !== 'namespace') {
        passthroughSources ??= 'undefined, '.repeat(passthroughIndex)
        passthroughSources += namespaceName
      } else if (passthroughSources !== undefined) {
        passthroughSources += 'undefined'
      }
      passthroughIndex++
      if (shouldReexport(name, realUrl)) {
        passthroughReexports += `export { ${exportName} } from ${JSON.stringify(sourceSpecifier)}\n`
      }
      continue
    }
    const variableName = `$${index}`
    declarationNames += declarationNames === '' ? variableName : `, ${variableName}`
    bindingNames += bindingNames === '' ? objectKey : `, ${objectKey}`
    if (bindingSources !== undefined) bindingSources += ', '
    if (namespaceName !== 'namespace') {
      bindingSources ??= 'undefined, '.repeat(index)
      bindingSources += namespaceName
    } else if (bindingSources !== undefined) {
      bindingSources += 'undefined'
    }
    writeCases += `    case ${index++}: ${variableName} = value; break\n`
    if (shouldReexport(name, realUrl)) {
      exportSpecifiers += exportSpecifiers === ''
        ? `${variableName} as ${exportName}`
        : `, ${variableName} as ${exportName}`
    }
  }
  const passthroughSourceArguments = passthroughSources === undefined ? '' : `, [${passthroughSources}]`
  const binder = declarationNames === ''
    ? passthroughNames === ''
      ? 'const __binder = new ModuleBinder(namespace)\n'
      : `const __binder = new ModuleBinder(namespace, undefined, undefined, undefined, [${passthroughNames}]${passthroughSourceArguments})\n`
    : `let ${declarationNames}
function __write (index, value) {
  switch (index) {
${writeCases}  }
}
const __binder = new ModuleBinder(namespace, [${bindingNames}], __write${bindingSources === undefined
  ? ''
  : `, [${bindingSources}]`}${passthroughNames === ''
  ? ''
  : `${bindingSources === undefined ? ', undefined' : ''}, [${passthroughNames}]${passthroughSourceArguments}`})
`
  const reexports = exportSpecifiers === '' ? '' : `export { ${exportSpecifiers} }\n`
  const registerName = withData ? 'registerWithData' : 'register'
  const registrationData = withData ? `, ${JSON.stringify(data)}` : ''

  return `
import { ${registerName}, ModuleBinder } from ${JSON.stringify(runtimeSpecifier)}
import * as namespace from ${JSON.stringify(moduleSpecifier)}
${originImports}
${binder}
${reexports}
${passthroughReexports}

__binder.flush()

${registerName}(${JSON.stringify(realUrl)}, __binder, ${JSON.stringify(originalSpecifier)}${registrationData})
`
}

/**
 * @param {WrapperOptions} options
 * @returns {string}
 */
export function buildWrapperSource (options) {
  return buildESMWrapperSource(options, false)
}

/**
 * @param {WrapperOptions & { data: unknown }} options
 * @returns {string}
 */
export function buildWrapperSourceWithData (options) {
  return buildESMWrapperSource(options, true)
}

/**
 * @param {string | ArrayBuffer | ArrayBufferView} source
 * @returns {string}
 */
export function sourceToString (source) {
  if (typeof source === 'string') return source
  if (Buffer.isBuffer(source)) return source.toString('utf8')
  if (ArrayBuffer.isView(source)) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
  }
  return Buffer.from(source).toString('utf8')
}

/**
 * @param {string | ArrayBuffer | ArrayBufferView} source
 * @returns {string}
 */
function prepareCommonJSSource (source) {
  source = sourceToString(source)
  return source.startsWith('#!') ? '//' + source.slice(2) : source
}

/**
 * @param {object} options
 * @param {string} options.realUrl
 * @param {string | ArrayBuffer | ArrayBufferView} options.source
 * @param {string} options.originalSpecifier
 * @param {unknown} [options.data]
 * @param {string} options.runtimeSpecifier
 * @param {boolean} [options.preserveOuterBindings]
 * @returns {string}
 */
export function buildCommonJSWrapperSource ({
  realUrl,
  source,
  originalSpecifier,
  data,
  runtimeSpecifier,
  preserveOuterBindings
}) {
  source = prepareCommonJSSource(source)

  const parameters = preserveOuterBindings ? '' : 'exports, require, module, __filename, __dirname'
  const invocation = 'call(module.exports, module.exports, require, module, ' +
    'typeof __filename === "undefined" ? undefined : __filename, ' +
    'typeof __dirname === "undefined" ? undefined : __dirname)'
  return `(function (${parameters}) {\n${source}\n}).${invocation}\n` +
    `require(${JSON.stringify(runtimeSpecifier)}).registerCommonJS(` +
    `${JSON.stringify(realUrl)}, module, ${JSON.stringify(originalSpecifier)}, ${JSON.stringify(data)})\n`
}
