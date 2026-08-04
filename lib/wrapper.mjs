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

/** @typedef {{ name: string, origin: string }} StarBinding */
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
 * @returns {Generator<Array, ProcessResult>}
 * A generator that yields I/O operations and ultimately returns the shimmed
 * bindings for all the exports from the module and any transitive export all
 * modules. `origins` (the defining module per `*`-sourced name) is `undefined`
 * for a module with no `export *`.
 */
export function * processModule ({ srcUrl, context, excludeDefault = false, depth = 0, seen }) {
  const { exportNames, starReexports } = yield * getExports(srcUrl, context)

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
        seen
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
 * @typedef {object} WrapperOptions
 * @property {string} realUrl The URL of the wrapped module.
 * @property {string[] | Map<string, string | StarBinding>} bindings Its exported bindings.
 * @property {string} originalSpecifier The specifier used to import the module.
 * @property {string} runtimeSpecifier The wrapper runtime import.
 * @property {(url: string) => string} [mapImport] Maps module URLs to bundler-owned imports.
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
  mapImport
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
  let writeCases = ''
  let index = 0
  for (const binding of bindings.values()) {
    const directName = typeof binding === 'string' ? binding : undefined
    const name = directName ?? binding.name
    let namespaceName = 'namespace'
    if (directName === undefined) {
      originNamespaces ??= new Map()
      namespaceName = originNamespaces.get(binding.origin)
      if (namespaceName === undefined) {
        namespaceName = `__ns${originNamespaces.size}`
        originNamespaces.set(binding.origin, namespaceName)
        const originSpecifier = mapImport?.(binding.origin) ?? binding.origin
        originImports += `import * as ${namespaceName} from ${JSON.stringify(originSpecifier)}\n`
      }
    }
    const variableName = `$${index}`
    const objectKey = JSON.stringify(name)
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
      const exportName = name === 'default' ? name : objectKey
      exportSpecifiers += exportSpecifiers === ''
        ? `${variableName} as ${exportName}`
        : `, ${variableName} as ${exportName}`
    }
  }
  const binder = declarationNames === ''
    ? 'const __binder = new ModuleBinder(namespace)\n'
    : `let ${declarationNames}
function __write (index, value) {
  switch (index) {
${writeCases}  }
}
const __binder = new ModuleBinder(namespace, [${bindingNames}], __write${bindingSources === undefined
  ? ''
  : `, [${bindingSources}]`})
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
function sourceToString (source) {
  if (typeof source === 'string') return source
  if (Buffer.isBuffer(source)) return source.toString('utf8')
  if (ArrayBuffer.isView(source)) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
  }
  return Buffer.from(source).toString('utf8')
}

/**
 * @param {object} options
 * @param {string} options.realUrl
 * @param {string | ArrayBuffer | ArrayBufferView} options.source
 * @param {string} options.originalSpecifier
 * @param {unknown} [options.data]
 * @param {string} options.runtimeSpecifier
 * @returns {string}
 */
export function buildCommonJSWrapperSource ({
  realUrl,
  source,
  originalSpecifier,
  data,
  runtimeSpecifier
}) {
  source = sourceToString(source)
  if (source.startsWith('#!')) source = '//' + source.slice(2)

  return `(function (exports, require, module, __filename, __dirname) {${source}\n` +
    '}).call(module.exports, module.exports, require, module, __filename, __dirname)\n' +
    `require(${JSON.stringify(runtimeSpecifier)}).registerCommonJS(` +
    `${JSON.stringify(realUrl)}, module, ${JSON.stringify(originalSpecifier)}, ${JSON.stringify(data)})\n`
}
