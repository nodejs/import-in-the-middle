// Private ESM facade core shared by the loaders (`create-hook.mjs`) and the
// experimental `wrapper.mjs` entry point: export-binding collection and wrapper
// source generation. Neither performs I/O itself; see `lib/io.mjs`.

import { URL } from 'url'
import { builtinModules } from 'module'
import { getModuleExports, importKey } from './get-exports.mjs'
import { RESOLVE } from './io.mjs'

// Depth at which `processModule` starts tracking visited URLs to break an
// `export *` cycle. Real re-export chains are only a few levels deep, so this
// is far beyond any legitimate graph yet well below the call-stack limit a
// cycle would otherwise hit. Below it the recursion pays only an integer
// compare per level and allocates no set.
const STAR_CYCLE_DEPTH = 100
const ACTIVE_STAR = { bindings: [], origins: undefined, format: undefined }

/** @typedef {import('./get-exports.mjs').AnalysisState} AnalysisState */
/** @typedef {import('./get-exports.mjs').ModuleExports} ModuleExports */
/** @typedef {import('./get-esm-exports.mjs').StarReexport} StarReexport */
/** @typedef {[moduleKey: string, binding: string, provider: string]} BindingIdentity */
/** @typedef {Map<string, Map<string, ModuleExports>>} StarGraph */
/** @typedef {{ name: string, origin: string }} StarBinding */
/** @typedef {{ url: string, format?: string, importAttributes: Record<string, string>, graph?: ModuleImportGraph }} ModuleImportTarget */
/** @typedef {{ targets: ModuleImportTarget[], acyclic: boolean }} ModuleImportGraph */
/** @typedef {(url: string, context: object) => Generator<Array, ModuleImportGraph>} ResolveImports */
/**
 * @typedef {object} ProcessResult
 * @property {string[] | Map<string, string | StarBinding>} bindings
 * @property {Map<string, string> | undefined} origins
 * @property {string | undefined} format
 * @property {Set<string> | undefined} [cyclicImports]
 */
/**
 * @typedef {object} CycleState
 * @property {string} rootUrl
 * @property {Set<string> | undefined} imports
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
  } catch (err) {
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

/** @param {StarReexport} request */
function importContext ({ parentURL, attributes }) {
  const context = { parentURL, kind: 'import' }
  if (attributes !== undefined) context.importAttributes = Object.fromEntries(attributes)
  return context
}

/** @param {StarReexport} request */
function * resolveRequest (request) {
  const context = importContext(request)
  const { importAttributes: declaredAttributes } = context
  const result = yield [RESOLVE, request.specifier, context]
  const { url, format } = result
  const importAttributes = result.importAttributes ?? declaredAttributes
  const key = importAttributes === undefined ? url : importKey(url, importAttributes)
  const loadContext = importAttributes === undefined ? { format } : { format, importAttributes, key }
  return { url, key, loadContext }
}

/**
 * Follows a single name only when star branches may point at the same binding.
 * A named re-export can lead to a name provided by another star chain.
 *
 * @param {string} key The module identity.
 * @param {string} name The name exported by that module.
 * @param {ModuleExports | undefined} moduleExports Undefined for an already known synthetic binding.
 * @param {AnalysisState} state Export analysis state.
 * @param {Set<string>} seen Module/name pairs visited during this lookup.
 * @param {StarGraph} [graph] Resolved star edges, when analyzing a cycle.
 * @param {boolean} [declarationsOnly=false] Stop at explicit re-exports without opening their targets.
 * @returns {Generator<Array, BindingIdentity | undefined | null>} A binding, no resolution, or ambiguity.
 */
function * resolveExportBinding (key, name, moduleExports, state, seen, graph, declarationsOnly = false) {
  const pair = declarationsOnly ? key : JSON.stringify([key, name])
  if (seen.has(pair)) return undefined
  seen.add(pair)

  if (moduleExports === undefined) return [key, name, key]
  if (name === 'module.exports' && moduleExports.format === 'builtin') return undefined
  const alias = moduleExports.exportAliases?.get(name)
  if (typeof alias === 'object') {
    if (declarationsOnly) return [key, name, key]
    const target = yield * followExportBinding(alias, alias.importName, state, seen, graph)
    return target == null ? target : [target[0], target[1], key]
  }
  const { exportNames, starReexports } = moduleExports
  if (Array.isArray(exportNames) ? exportNames.includes(name) : exportNames.has(name)) return [key, alias ?? name, key]
  if (name === 'default' || starReexports === undefined) return undefined

  let binding
  const children = graph?.get(key) ?? starReexports
  for (const child of children) {
    let candidate
    if (Array.isArray(child)) {
      candidate = yield * resolveExportBinding(child[0], name, child[1], state, seen, graph, declarationsOnly)
    } else {
      candidate = yield * followExportBinding(child, name, state, seen, graph)
    }
    if (candidate === undefined) continue
    if (candidate === null || (binding !== undefined && !sameBinding(binding, candidate))) return null
    binding = candidate
  }
  return binding
}

/**
 * @param {StarReexport} request The request from the declaring module.
 * @param {string} name The imported name.
 * @param {AnalysisState} state Export analysis state.
 * @param {Set<string>} seen Module/name pairs visited during this lookup.
 * @param {StarGraph} [graph] Resolved star edges, when analyzing a cycle.
 * @returns {Generator<Array, BindingIdentity | undefined | null>}
 */
function * followExportBinding (request, name, state, seen, graph) {
  const { url, key, loadContext } = yield * resolveRequest(request)
  const moduleExports = yield * getModuleExports(url, loadContext, false, state, key)
  return yield * resolveExportBinding(key, name, moduleExports, state, seen, graph)
}

/**
 * @param {BindingIdentity} left The first binding.
 * @param {BindingIdentity} right The second binding.
 */
function sameBinding (left, right) {
  return left[0] === right[0] && left[1] === right[1]
}

/**
 * A cycle makes a subtree result depend on its ancestors. Resolve the graph
 * once and look up each name separately instead of retrying every path.
 *
 * @param {string} rootKey The wrapped module identity.
 * @param {ModuleExports} root The wrapped module exports.
 * @param {AnalysisState} state Export analysis state.
 * @returns {Generator<Array, ProcessResult>}
 */
function * collectCyclicStars (rootKey, root, state) {
  const modules = new Map([[rootKey, root]])
  const providers = new Map()
  const graph = new Map()
  for (const [key, moduleExports] of modules) {
    const edges = new Map()
    graph.set(key, edges)
    for (const request of moduleExports.starReexports ?? []) {
      const target = yield * resolveRequest(request)
      if (edges.has(target.key)) continue
      let child = modules.get(target.key)
      if (child === undefined) {
        child = yield * getModuleExports(target.url, target.loadContext, false, state, target.key)
        modules.set(target.key, child)
        for (const name of child.exportNames) {
          if (shouldExcludeExport(name, target.url)) continue
          providers.set(name, providers.has(name) ? null : target.key)
        }
      }
      edges.set(target.key, child)
    }
  }

  const bindings = new Map()
  for (const name of root.exportNames) bindings.set(name, name)
  for (const [name, provider] of providers) {
    if (bindings.has(name)) continue
    if (provider !== null) {
      bindings.set(name, { name, origin: provider })
      continue
    }
    let binding = yield * resolveExportBinding(rootKey, name, root, state, new Set(), graph, true)
    if (binding === null && state.hasNamedReexports) {
      binding = yield * resolveExportBinding(rootKey, name, root, state, new Set(), graph)
    }
    if (binding != null) bindings.set(name, { name, origin: binding[2] })
  }
  return { bindings, origins: undefined, format: root.format }
}

/**
 * Processes a module's exports and builds its wrapper bindings.
 *
 * Written as a "sans-io" generator (see `lib/io.mjs`): instead of calling the
 * loader's resolve/load hooks directly it `yield`s `[RESOLVE, ...]` to resolve
 * star re-exports and `[LOAD, ...]` (via {@link getModuleExports}) to read source,
 * and is driven by either `driveSync` (for `module.registerHooks`) or
 * `driveAsync` (for `module.register`). The body is identical for both, so
 * there is a single implementation to maintain.
 *
 * @param {object} params
 * @param {string} params.srcUrl The full URL to the module to process.
 * @param {string} [params.key] The caller-owned module identity, including import type.
 * @param {object} params.context Provided by the loaders API.
 * @param {ResolveImports} [params.resolveImports] The cached static-import
 * resolver. Only the loaders pass it, which enables the circular re-export scan.
 * @param {boolean} [params.excludeDefault = false] Exclude the default export.
 * @param {number} [params.depth = 0] Star-re-export recursion depth. Used to
 * detect `export *` cycles (`a` re-exports `b`, `b` re-exports `a`) cheaply:
 * the acyclic common case pays only an integer compare per level, and the
 * cycle-tracking set is allocated only once recursion is implausibly deep.
 * @param {Set<string>} [params.seen] URLs currently on the recursion stack,
 * created lazily once `depth` crosses {@link STAR_CYCLE_DEPTH}. A URL is added
 * before descending into its subtree and removed once that subtree finishes, so
 * it tracks the active path rather than every URL ever visited.
 * @param {CycleState} [params.cycleState] The wrapper root and detected cycle edges.
 * @param {AnalysisState} [params.state] Export analysis state. Omitted by the
 * loaders, which use the process-wide caches and host fallbacks and join
 * relative star specifiers before resolving them.
 * @returns {Generator<Array, ProcessResult>}
 * A generator that yields I/O operations and ultimately returns the shimmed
 * bindings for all the exports from the module and any transitive export all
 * modules. `origins` (the defining module per `*`-sourced name) is `undefined`
 * for a module with no `export *`.
 */
export function * processModule ({ srcUrl, key, context, resolveImports, excludeDefault = false, depth = 0, seen, cycleState, state }) {
  let isCycleRoot = false
  const moduleExports = yield * getModuleExports(srcUrl, context, cycleState !== undefined, state, key)
  const { exportNames, starReexports, format } = moduleExports

  if (cycleState !== undefined && moduleExports.hasModuleImports) {
    cycleState.imports ??= new Set()
    cycleState.imports.add(srcUrl)
  }

  // Most modules have no export star. Keep that path array-backed so it pays
  // neither merge bookkeeping nor a Map lookup for each direct export.
  if (starReexports === undefined) {
    if (!excludeDefault) {
      return { bindings: exportNames, origins: undefined, format }
    }

    const bindings = []
    for (const name of exportNames) {
      if (shouldExcludeExport(name, srcUrl)) continue
      bindings.push(name)
    }
    return { bindings, origins: undefined, format }
  }

  const callerOwnsGraph = state?.hostIO === false
  if (callerOwnsGraph && starReexports.length > 1) state.hasStarBranches = true
  const memoizeStars = callerOwnsGraph && state.hasStarBranches && format !== 'commonjs'
  if (memoizeStars) {
    const cached = moduleExports.starBindings
    if (cached !== undefined) return cached ?? ACTIVE_STAR
    moduleExports.starBindings = null
  }

  if (cycleState === undefined && resolveImports !== undefined) {
    cycleState = { rootUrl: srcUrl, imports: undefined }
    isCycleRoot = true
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
  let firstStarKey
  let processedStarKeys

  for (const name of exportNames) {
    if (excludeDefault && shouldExcludeExport(name, srcUrl)) continue
    bindings.set(name, name)
  }

  for (const star of starReexports) {
    const { specifier, parentURL } = star
    // The loaders join relative paths against the module declaring the star. A
    // caller that owns the graph receives the specifier as written, like a
    // CommonJS re-export, and resolves it against `parentURL` itself.
    let request = specifier
    if (!callerOwnsGraph) {
      request = isBareSpecifier(specifier) ? specifier : new URL(specifier, parentURL).href
    }
    // We need to resolve bare specifiers to a full URL. We also need to
    // resolve all sub-modules to get the `format`. We can't rely on the
    // parent's `format` to know if this sub-module is ESM or CJS!
    const resolveContext = callerOwnsGraph ? importContext(star) : { parentURL }
    const declaredAttributes = callerOwnsGraph ? resolveContext.importAttributes : undefined
    const result = yield [RESOLVE, request, resolveContext]
    const importAttributes = callerOwnsGraph ? result.importAttributes ?? declaredAttributes : undefined
    const target = importAttributes === undefined ? result.url : importKey(result.url, importAttributes)

    // Most star modules have one target. Defer the collection until a second
    // distinct target while still ignoring repeated declarations.
    if (firstStarKey === undefined) {
      firstStarKey = target
    } else if (processedStarKeys === undefined) {
      if (target === firstStarKey) continue
      processedStarKeys = [firstStarKey, target]
    } else {
      if (processedStarKeys.includes(target)) continue
      processedStarKeys.push(target)
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
      if (seen.has(target)) {
        if (callerOwnsGraph) return ACTIVE_STAR
        continue
      }
      seen.add(target)
    }

    try {
      const childContext = callerOwnsGraph ? { format: result.format } : { ...context, format: result.format }
      if (importAttributes !== undefined) {
        childContext.importAttributes = importAttributes
        childContext.key = target
      }
      const sub = yield * processModule({
        srcUrl: result.url,
        key: target,
        context: childContext,
        resolveImports,
        excludeDefault: true,
        depth: depth + 1,
        seen,
        cycleState,
        state
      })
      if (callerOwnsGraph && sub === ACTIVE_STAR) {
        return depth === 0 ? yield * collectCyclicStars(key ?? srcUrl, moduleExports, state) : ACTIVE_STAR
      }

      for (const binding of sub.bindings.values()) {
        const directName = typeof binding === 'string' ? binding : undefined
        const name = directName ?? binding.name
        if (ambiguousStars?.has(name)) continue

        const origin = directName === undefined ? binding.origin : sub.origins?.get(name) ?? target
        if (bindings.has(name)) {
          // An explicit export shadows every star re-export.
          if (!starOrigins.has(name)) continue

          const previous = starOrigins.get(name)
          let same = previous === origin
          if (!same && state?.hasNamedReexports) {
            const previousExports = state.esmExports.get(previous)
            const originExports = state.esmExports.get(origin)
            if (typeof previousExports?.exportAliases?.get(name) === 'object' ||
                typeof originExports?.exportAliases?.get(name) === 'object') {
              const first = yield * resolveExportBinding(previous, name, previousExports, state, new Set())
              const second = yield * resolveExportBinding(origin, name, originExports, state, new Set())
              same = first != null && second != null && sameBinding(first, second)
            }
          }
          if (same) {
            // IITM's aggregate namespace sees the wrapped paths as ambiguous.
            // Retain the defining URL so source generation can import it once.
            bindings.set(name, { name, origin: previous })
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
      seen?.delete(target)
    }
  }

  if (isCycleRoot && cycleState.imports !== undefined) {
    const candidates = cycleState.imports
    cycleState.imports = undefined
    const seenImports = new Set()
    for (const candidate of candidates) {
      yield * findCyclicImports(candidate, context, cycleState, seenImports, resolveImports)
    }
  }

  if (isCycleRoot && cycleState.imports !== undefined) {
    return { bindings, origins: starOrigins, format, cyclicImports: cycleState.imports }
  }
  const result = { bindings, origins: starOrigins, format }
  if (memoizeStars && excludeDefault) moduleExports.starBindings = result
  return result
}

/**
 * @param {string} url The module whose static requests can close the cycle.
 * @param {object} context The metadata load context.
 * @param {CycleState} cycleState The wrapper root and its closing importers.
 * @param {Set<string>} seen Modules already inspected for this wrapper.
 * @param {ResolveImports} resolveImports The cached static-import resolver.
 * @param {ModuleImportGraph} [graph] The resolved target graph, if already available.
 */
function * findCyclicImports (url, context, cycleState, seen, resolveImports, graph) {
  graph ??= yield * resolveImports(url, context)
  if (graph.acyclic) return true
  if (seen.has(url)) return false
  seen.add(url)
  let acyclic = true
  for (const imported of graph.targets) {
    const { url: target, format, importAttributes } = imported
    if (target === cycleState.rootUrl) {
      cycleState.imports ??= new Set()
      cycleState.imports.add(url)
      acyclic = false
    } else if (format === 'module' || format === 'module-typescript' || format === undefined) {
      if (imported.graph?.acyclic) continue
      const targetContext = { ...context, format, importAttributes }
      imported.graph ??= yield * resolveImports(target, targetContext)
      if (!(yield * findCyclicImports(target, targetContext, cycleState, seen, resolveImports, imported.graph))) {
        acyclic = false
      }
    }
  }
  if (acyclic) graph.acyclic = true
  return acyclic
}

/**
 * Builds the ESM facade source shared by the loaders and `wrapper.mjs`.
 *
 * The emitted imports are the only part that varies by caller: `runtime` is the
 * specifier of the registration runtime (`lib/register.js`), and `mapModule`
 * maps a canonical module URL to the specifier the facade imports it by. The
 * loaders pass neither mapping, so they import the canonical URLs directly.
 * Registration always uses the canonical `realUrl`.
 *
 * @param {string} realUrl The canonical URL of the wrapped module.
 * @param {string[] | Map<string, string | StarBinding>} bindings Its exported bindings.
 * @param {string} originalSpecifier The specifier used to import the module.
 * @param {string | undefined} format The wrapped module's loader format.
 * @param {string} runtime The specifier of the registration runtime.
 * @param {(key: string) => string} [mapModule] Renders a module request for an import statement.
 * @param {boolean} [staged] Defer Hook invocation until the native root finishes.
 * Only the loaders stage, for a circular re-export.
 * @returns {string | { source: string, facadeSpecifiers: string }}
 */
export function buildWrapperSource (realUrl, bindings, originalSpecifier, format, runtime, mapModule, staged = false) {
  const moduleSpecifier = mapModule === undefined ? JSON.stringify(realUrl) : mapModule(realUrl)
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
  let facadeSpecifiers = ''
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
        const origin = mapModule === undefined ? JSON.stringify(binding.origin) : mapModule(binding.origin)
        originImports += `import * as ${namespaceName} from ${origin}\n`
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
      const exportSpecifier = staged ? variableName : `${variableName} as ${name === 'default' ? name : objectKey}`
      if (staged) {
        if (facadeSpecifiers !== '') facadeSpecifiers += ', '
        facadeSpecifiers += `${variableName} as ${objectKey}`
      }
      if (exportSpecifiers !== '') exportSpecifiers += ', '
      exportSpecifiers += exportSpecifier
    }
  }
  let binder = 'const __binder = new ModuleBinder(namespace)\n'
  if (declarationNames !== '') {
    let sources = ''
    if (bindingSources !== undefined) {
      sources = `, [${bindingSources}]`
    } else if (staged) {
      sources = ', undefined'
    }
    binder = `let ${declarationNames}
function __write (index, value) {
  switch (index) {
${writeCases}  }
}
const __binder = new ModuleBinder(namespace, [${bindingNames}], __write${sources}${staged ? ', true' : ''})
`
  }
  const reexports = exportSpecifiers === '' ? '' : `export { ${exportSpecifiers} }\n`

  let registration = 'export default __binder'
  if (!staged) {
    registration = `__binder.flush()\n\nregister(${JSON.stringify(realUrl)}, __binder, ${JSON.stringify(originalSpecifier)}, ${JSON.stringify(format)})`
  }

  const source = `
import { ${staged ? '' : 'register, '}ModuleBinder } from ${JSON.stringify(runtime)}
import * as namespace from ${moduleSpecifier}
${originImports}
${binder}
${reexports}

${registration}
`
  return staged ? { source, facadeSpecifiers } : source
}
