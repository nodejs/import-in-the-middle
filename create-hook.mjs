// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { URL, fileURLToPath } from 'url'
import { inspect } from 'util'
import { builtinModules } from 'module'
import {
  getExports,
  hasModuleExportsCJSDefault
} from './lib/get-exports.mjs'
import { RESOLVE, driveSync, driveAsync } from './lib/io.mjs'
import { supportsSyncHooks } from './supports-sync-hooks.mjs'

// Re-exported for backwards compatibility: `supportsSyncHooks` now lives in its
// own import-free module so a CommonJS preloader can check it without loading
// this file's acorn / cjs-module-lexer dependency graph.
export { supportsSyncHooks }

const specifiers = new Map()
const isWin = process.platform === 'win32'

// Depth at which `processModule` starts tracking visited URLs to break an
// `export *` cycle. Real re-export chains are only a few levels deep, so this
// is far beyond any legitimate graph yet well below the call-stack limit a
// cycle would otherwise hit. Below it the recursion pays only an integer
// compare per level and allocates no set.
const STAR_CYCLE_DEPTH = 100

// FIXME: Typescript extensions are added temporarily until we find a better
// way of supporting arbitrary extensions
const EXTENSION_RE = /\.(js|mjs|cjs|ts|mts|cts)$/
// The `-typescript` formats are listed unconditionally; getExports strips the
// types when the runtime supports it and otherwise falls back to onWrapFailure.
const HANDLED_FORMATS = new Set([
  'builtin', 'module', 'commonjs', 'module-typescript', 'commonjs-typescript'
])
const TRACE_WARNINGS = process.execArgv.includes('--trace-warnings')

function hasIitm (url) {
  // Fast path: avoid URL parsing on the hot path when there's clearly no iitm.
  if (typeof url !== 'string' || url.indexOf('iitm') === -1) {
    return false
  }
  try {
    return new URL(url).searchParams.has('iitm')
  } catch {
    return false
  }
}

function isIitm (url, meta) {
  return url === meta.url || url === meta.url.replace('hook.mjs', 'create-hook.mjs')
}

function deleteIitm (url) {
  // Fast path: avoid URL parsing / try-catch on bare specifiers and normal file URLs.
  if (typeof url !== 'string' || url.indexOf('iitm') === -1) {
    return url
  }
  let resultUrl
  const stackTraceLimit = Error.stackTraceLimit
  try {
    Error.stackTraceLimit = 0
    const urlObj = new URL(url)
    if (urlObj.searchParams.has('iitm')) {
      urlObj.searchParams.delete('iitm')
      resultUrl = urlObj.href
      if (resultUrl.startsWith('file:///node:')) {
        resultUrl = resultUrl.replace('file:///', '')
      }
    } else {
      resultUrl = urlObj.href
    }
  } catch {
    resultUrl = url
  }
  Error.stackTraceLimit = stackTraceLimit
  return resultUrl
}

/**
 * Determines if a specifier represents an export all ESM line.
 * Note that the expected `line` isn't 100% valid ESM. It is derived
 * from the `getExports` function wherein we have recognized the true
 * line and re-mapped it to one we expect.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isStarExportLine (line) {
  return /^\* from /.test(line)
}

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
 * Determines whether the input is a bare specifier, file URL or a regular expression.
 *
 * - node: prefixed URL strings are considered bare specifiers in this context.
 */
function isBareSpecifierFileUrlOrRegex (input) {
  if (input instanceof RegExp) {
    return true
  }

  // Relative and absolute paths
  if (
    input.startsWith('.') ||
    input.startsWith('/')) {
    return false
  }

  const stackTraceLimit = Error.stackTraceLimit
  try {
    Error.stackTraceLimit = 0
    // eslint-disable-next-line no-new
    const url = new URL(input)
    // We consider node: URLs bare specifiers in this context
    return url.protocol === 'file:' || url.protocol === 'node:'
  } catch (err) {
    // Anything that fails parsing is a bare specifier
    return true
  } finally {
    Error.stackTraceLimit = stackTraceLimit
  }
}

/**
 * Ensure an array only contains bare specifiers, file URLs or regular expressions.
 *
 * - We consider node: prefixed URL string as bare specifiers in this context.
 * - For node built-in modules, we add additional node: prefixed modules to the
 *   output array.
 */
function ensureArrayWithBareSpecifiersFileUrlsAndRegex (array, type) {
  if (!Array.isArray(array)) {
    return undefined
  }

  const invalid = array.filter(s => !isBareSpecifierFileUrlOrRegex(s))

  if (invalid.length) {
    throw new Error(`'${type}' option only supports bare specifiers, file URLs or regular expressions. Invalid entries: ${inspect(invalid)}`)
  }

  // Rather than evaluate whether we have a node: scoped built-in-module for
  // every call to resolve, we just add them to include/exclude now.
  for (const each of array) {
    if (typeof each === 'string' && !each.startsWith('node:') && builtinModules.includes(each)) {
      array.push(`node:${each}`)
    }
  }

  return array
}

function emitWarning (err) {
  // Unfortunately, process.emitWarning does not output the full error
  // with error.cause like console.warn does so we need to inspect it when
  // tracing warnings
  const warnMessage = TRACE_WARNINGS ? inspect(err) : err
  process.emitWarning(warnMessage)
}

/**
 * Builds the setter/getter/re-export block injected into the wrapper module for
 * a single named export. This is pure string generation, identical regardless
 * of how the loader is driven, so both the synchronous and asynchronous paths
 * share it.
 *
 * The value is read from `namespaceVar`, the wrapper's namespace binding for the
 * module that *defines* the export. For a module's own exports that is the
 * wrapped module itself; for a name re-exported through `export *` it is the
 * leaf that declares it. Reading from the defining module rather than the
 * aggregating one keeps the value resolvable when the same binding reaches the
 * aggregator through more than one re-export chain — Node sees those chains as
 * distinct wrapper modules and leaves the name ambiguous (hence `undefined`) on
 * the aggregate namespace, while the defining module always holds it (#171).
 *
 * @param {string} n The exported name.
 * @param {string} srcUrl The URL of the module the export belongs to.
 * @param {string} namespaceVar The wrapper binding holding `srcUrl`'s namespace.
 * @returns {string}
 */
function buildSetter (n, srcUrl, namespaceVar) {
  const variableName = `$${n.replace(/[^a-zA-Z0-9_$]/g, '_')}`
  const objectKey = JSON.stringify(n)
  const reExportedName = n === 'default' ? n : objectKey

  // Fall back to namespace['default'] for the module.exports synthetic export,
  // which builtins don't expose on the native ESM namespace.
  const useFallback = n === 'module.exports'

  // Builtins don't expose the module.exports synthetic name, so skip its re-export.
  const reExportLine = (n === 'module.exports' && (srcUrl.startsWith('node:') || builtinModules.includes(srcUrl)))
    ? ''
    : `export { ${variableName} as ${reExportedName} }`

  return `let ${variableName}
__binder.bind(${objectKey}, ${namespaceVar}, v => { ${variableName} = v }, () => ${variableName}, ${useFallback})
${reExportLine}`
}

/**
 * Processes a module's exports and builds a set of setter blocks.
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
 * @param {object} params.context Provided by the loaders API.
 * @param {boolean} [params.excludeDefault = false] Exclude the default export.
 * @param {number} [params.depth = 0] Star-re-export recursion depth. Used to
 * detect `export *` cycles (`a` re-exports `b`, `b` re-exports `a`) cheaply:
 * the acyclic common case pays only an integer compare per level, and the
 * cycle-tracking set is allocated only once recursion is implausibly deep.
 * @param {Set<string>} [params.seen] URLs currently on the recursion stack,
 * created lazily once `depth` crosses {@link STAR_CYCLE_DEPTH}. A URL is added
 * before descending into its subtree and removed once that subtree finishes, so
 * it tracks the active path rather than every URL ever visited.
 * @param {Map<string, string>} [params.originNamespaces] Shared registry mapping
 * a defining-module URL to the wrapper namespace alias a same-origin `export *`
 * collision must read it from. Absent until the first such collision; then
 * threaded through the recursion so one defining module yields one alias and
 * {@link buildWrapperSource} imports each once. Only `*`-collided names use it;
 * every other export reads from the wrapped module's own `namespace`.
 *
 * @returns {Generator<Array, { setters: Map<string, string>, origins: (Map<string, string> | undefined), originNamespaces: (Map<string, string> | undefined) }>}
 * A generator that yields I/O operations and ultimately returns the shimmed
 * setters for all the exports from the module and any transitive export all
 * modules. `origins` (the defining module per `*`-sourced name) is `undefined`
 * for a module with no `export *`; `originNamespaces` stays `undefined` unless a
 * same-origin `*` collision actually needed an alias.
 */
function * processModule ({ srcUrl, context, excludeDefault = false, depth = 0, seen, originNamespaces }) {
  const exportNames = yield * getExports(srcUrl, context)
  const setters = new Map()

  // Maps each live `*`-sourced name to the module that defined it. Its keys
  // double as "this name came from a `*` re-export" (so an explicit export can
  // override it), and its values let two `*` re-exports of the same name be told
  // apart. Allocated on the first `export *`, never for a module without one; a
  // single Map carries both facts so a star with no collision pays one structure
  // and one write per name, not two.
  let starOrigins

  // A name pulled in through more than one `export *` chain that all bottom out
  // at the same module stays exported (ECMAScript ResolveExport;
  // tc39/ecma262#3715), but the *aggregate* namespace this wrapper imports drops
  // it: under iitm the chains are distinct wrapped modules, so Node sees the
  // re-export as ambiguous and the name reads back undefined. Only those names
  // must instead read from their defining module's own namespace, which always
  // holds the value. `originNamespaces` maps such a defining module to the alias
  // the wrapper imports for it; it is allocated on the first surviving
  // collision, so a module without one emits no extra import (#171).
  const ensureOriginNamespace = (origin) => {
    originNamespaces ??= new Map()
    let alias = originNamespaces.get(origin)
    if (alias === undefined) {
      alias = `__ns${originNamespaces.size}`
      originNamespaces.set(origin, alias)
    }
    return alias
  }

  const addSetter = (name, setter, isStarExport, origin) => {
    if (setters.has(name)) {
      if (isStarExport) {
        // `starOrigins.has(name)` means the existing entry also came from a `*`
        // re-export (an explicit export would not be tracked here).
        if (starOrigins.has(name)) {
          if (starOrigins.get(name) === origin) {
            // The same binding reached through two `*` re-export chains. It
            // stays exported, but the aggregate namespace dropped it, so point
            // its setter at the defining module's namespace instead.
            setters.set(name, buildSetter(name, origin, ensureOriginNamespace(origin)))
          } else {
            // Genuinely ambiguous: two `*` re-exports name it from different
            // modules. Per ResolveExport the name is excluded entirely.
            setters.delete(name)
            starOrigins.delete(name)
          }
        }
        // An explicit export already shadows the `*` re-export; leave it.
      }
    } else {
      if (isStarExport) {
        starOrigins.set(name, origin)
      }

      setters.set(name, setter)
    }
  }

  for (const n of exportNames) {
    if (excludeDefault) {
      const isDefault = n === 'default' ||
        (
          n === 'module.exports' &&
          context.format === 'commonjs' &&
          hasModuleExportsCJSDefault
        )

      if (isDefault) continue
    }

    if (isStarExportLine(n) === true) {
      const [, modFile] = n.split('* from ')

      // Relative paths need to be resolved relative to the parent module
      const newSpecifier = isBareSpecifier(modFile) ? modFile : new URL(modFile, srcUrl).href
      // We need to resolve bare specifiers to a full URL. We also need to
      // resolve all sub-modules to get the `format`. We can't rely on the
      // parent's `format` to know if this sub-module is ESM or CJS!
      const result = yield [RESOLVE, newSpecifier, { parentURL: srcUrl }]

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
          originNamespaces
        })

        // Adopt any registry a nested `export *` minted before processing this
        // child's results, so a collision detected here extends the same Map the
        // child's setters already reference (one alias per defining module across
        // the whole tree) rather than orphaning the child's into a second Map.
        originNamespaces ??= sub.originNamespaces

        // Star targets build their setters against `namespace` like any other
        // module; only a surviving same-origin collision (in addSetter) rewrites
        // the affected name to read from its defining module's alias.
        for (const [name, setter] of sub.setters) {
          addSetter(name, setter, true, sub.origins?.get(name) ?? result.url)
        }
      } finally {
        seen?.delete(result.url)
      }
    } else {
      addSetter(n, buildSetter(n, srcUrl, 'namespace'), false)
    }
  }

  return { setters, origins: starOrigins, originNamespaces }
}

function addIitm (url) {
  const urlObj = new URL(url)
  urlObj.searchParams.set('iitm', 'true')
  return urlObj.href
}

export function createHook (meta) {
  let cachedResolve
  const iitmURL = new URL('lib/register.js', meta.url).toString()
  let includeModules, excludeModules
  let shouldInclude = defaultShouldInclude

  // Track CJS module URLs that IITM has wrapped. On Node 24+, CJS modules loaded
  // via loadCJSModule (in an ESM import chain) have their require() calls for
  // builtins routed through the ESM resolver. Without this guard, IITM would
  // intercept those require() calls and return an ESM namespace object instead
  // of the native CJS module value (e.g. EventEmitter constructor), breaking
  // patterns like `class App extends require('events') {}`.
  const cjsInIitmChain = new Set()

  // Default matcher, used unless the consumer supplies its own `shouldInclude`
  // (see applyOptions). It applies the include/exclude lists, so finishResolve
  // always has a predicate to call and never has to special-case its absence.
  //
  // We check the specifier to match libraries loaded with bare specifiers from
  // node_modules, and the full file URL for non-bare specifier imports (relative
  // paths would be error prone). An absolute path entry added via Hook over the
  // message port matches the resolved file path, so it is resolved here.
  function defaultShouldInclude (url, specifier) {
    let resultPath
    if (url.startsWith('file:')) {
      const stackTraceLimit = Error.stackTraceLimit
      Error.stackTraceLimit = 0
      try {
        resultPath = fileURLToPath(url)
      } catch {}
      Error.stackTraceLimit = stackTraceLimit
    }
    function match (each) {
      if (each instanceof RegExp) {
        return each.test(url)
      }

      return each === specifier || each === url || (resultPath && each === resultPath)
    }

    if (includeModules && !includeModules.some(match)) {
      return false
    }

    if (excludeModules && excludeModules.some(match)) {
      return false
    }

    return true
  }

  // Applies the include/exclude/message-port configuration. Shared by the
  // asynchronous `initialize` (off-thread `module.register`, which receives
  // `data` over the registration boundary) and by synchronous registration
  // (`module.registerHooks`), which has no `initialize` step and passes the
  // same options directly.
  function applyOptions (data) {
    includeModules = ensureArrayWithBareSpecifiersFileUrlsAndRegex(data.include, 'include')
    excludeModules = ensureArrayWithBareSpecifiersFileUrlsAndRegex(data.exclude, 'exclude')

    // A consumer can supply its own matcher as `shouldInclude(url, specifier)`,
    // taking ownership of the include/exclude decision instead of expressing it
    // as bare-specifier / file-URL / regex lists. It replaces the default list
    // matcher and is called with the resolved URL and specifier; otherwise the
    // default applies the include/exclude options.
    shouldInclude = typeof data.shouldInclude === 'function' ? data.shouldInclude : defaultShouldInclude

    if (data.addHookMessagePort) {
      data.addHookMessagePort.on('message', (modules) => {
        if (includeModules === undefined) {
          includeModules = []
        }

        for (const each of modules) {
          if (!each.startsWith('node:') && builtinModules.includes(each)) {
            includeModules.push(`node:${each}`)
          }

          includeModules.push(each)
        }

        data.addHookMessagePort.postMessage('ack')
      }).unref()
    }
  }

  async function initialize (data) {
    if (global.__import_in_the_middle_initialized__) {
      process.emitWarning("The 'import-in-the-middle' hook has already been initialized")
    }

    global.__import_in_the_middle_initialized__ = true

    if (data) {
      applyOptions(data)
    }
  }

  // Shared post-processing for the `resolve` hook: everything that happens
  // once the parent loader has turned the specifier into a resolved URL. The
  // only difference between the asynchronous and synchronous hooks is whether
  // that resolution was awaited, so all the wrapping decisions live here.
  function finishResolve (result, specifier, context, parentURL) {
    // Do not wrap the entrypoint module. Many CLIs check whether they are the
    // "main" module (e.g. require.main === module). Wrapping changes how they
    // are evaluated, and can make them exit without doing anything.
    if (parentURL === '') {
      if (!EXTENSION_RE.test(result.url) && !hasIitm(result.url)) {
        return { url: result.url, format: 'commonjs' }
      }
      return result
    }

    // Never wrap a module whose format we don't handle (e.g. json, wasm); this
    // holds regardless of how inclusion is decided below.
    if (result.format && !HANDLED_FORMATS.has(result.format)) {
      return result
    }

    // The synchronous hooks (`module.registerHooks`) fire for `require()` as well
    // as `import`, but iitm only owns the ESM graph: CommonJS modules are
    // instrumented separately through require-in-the-middle, and `require()` must
    // return the native, mutable module value (e.g. graceful-fs does
    // `Object.defineProperty(require('fs'), ...)`, which throws on a frozen ESM
    // namespace). Node reports the active module system in `context.conditions`
    // ('require' vs 'import'), so leave any require() resolution untouched. The
    // asynchronous hook never sees the 'require' condition, so this is a no-op
    // there and only affects the synchronous path.
    if (context.conditions?.includes('require')) {
      return result
    }

    // `shouldInclude` is always set (the include/exclude list matcher by default,
    // a consumer-provided predicate otherwise), so no nullish check is needed.
    if (!shouldInclude(result.url, specifier)) {
      return result
    }

    if (isIitm(parentURL, meta) || (parentURL && hasIitm(parentURL))) {
      return result
    }

    // When a CJS module is loaded by an IITM shim, its require() calls for
    // builtins may be routed through the ESM resolver on Node 24+. Skip IITM
    // wrapping in that case so require() returns the native module value.
    // We also propagate the membership to the resolved child so that its own
    // transitive require() calls are likewise skipped (the entire synchronous
    // CJS require chain must remain unwrapped to avoid ERR_VM_MODULE_LINK_FAILURE).
    if (cjsInIitmChain.has(parentURL)) {
      cjsInIitmChain.add(result.url)
      return result
    }

    // We don't want to attempt to wrap native modules
    if (result.url.endsWith('.node')) {
      return result
    }

    // Node.js v21 renames importAssertions to importAttributes
    const importAttributes = context.importAttributes || context.importAssertions
    if (importAttributes && importAttributes.type === 'json') {
      return result
    }

    // If the file is referencing itself, we need to skip adding the iitm search params
    if (result.url === parentURL) {
      return {
        url: result.url,
        shortCircuit: true,
        format: result.format
      }
    }

    specifiers.set(result.url, specifier)

    return {
      url: addIitm(result.url),
      shortCircuit: true,
      // Node's synchronous resolver drops `format: 'builtin'` for bare builtin
      // specifiers (`require('crypto')` -> `node:crypto`), so restore it;
      // otherwise the load hook reads `node:crypto` from disk and throws ENOENT.
      format: result.format ?? (result.url.startsWith('node:') ? 'builtin' : undefined)
    }
  }

  async function resolve (specifier, context, parentResolve) {
    cachedResolve = parentResolve

    // See https://github.com/nodejs/import-in-the-middle/pull/76.
    if (specifier === iitmURL) {
      return {
        url: specifier,
        shortCircuit: true
      }
    }

    const { parentURL = '' } = context
    const newSpecifier = deleteIitm(specifier)
    if (isWin && parentURL.indexOf('file:node') === 0) {
      context.parentURL = ''
    }
    const result = await parentResolve(newSpecifier, context)

    return finishResolve(result, specifier, context, parentURL)
  }

  // Synchronous counterpart to `resolve`, for `module.registerHooks`. The
  // synchronous `nextResolve` returns its result directly. We stash it so the
  // synchronous `load` hook can resolve star re-exports later, mirroring how
  // `resolve` caches `parentResolve`.
  function resolveSync (specifier, context, nextResolve) {
    cachedResolve = nextResolve

    if (specifier === iitmURL) {
      return {
        url: specifier,
        shortCircuit: true
      }
    }

    const { parentURL = '' } = context
    const newSpecifier = deleteIitm(specifier)
    if (isWin && parentURL.indexOf('file:node') === 0) {
      context.parentURL = ''
    }
    const result = nextResolve(newSpecifier, context)

    return finishResolve(result, specifier, context, parentURL)
  }

  // Builds the wrapper module source that re-exports the real module through
  // iitm's proxy. Pure string generation shared by the asynchronous and
  // synchronous `load` paths.
  function buildWrapperSource (realUrl, setters, originalSpecifier, originNamespaces) {
    // The wrapped module imports its namespace as `namespace`, which serves
    // every export but the ones a same-origin `export *` collision forced onto
    // their defining module (#171): the aggregate namespace drops those as
    // ambiguous under iitm, so each such defining module gets its own alias the
    // wrapper imports. Absent the registry (no such collision) nothing is added.
    let originImports = ''
    if (originNamespaces !== undefined) {
      for (const [originUrl, alias] of originNamespaces) {
        originImports += `import * as ${alias} from ${JSON.stringify(originUrl)}\n`
      }
    }

    return `
import { register, ModuleBinder } from '${iitmURL}'
import * as namespace from ${JSON.stringify(realUrl)}
${originImports}
const __binder = new ModuleBinder()

${Array.from(setters.values()).join('\n')}

__binder.flush()

register(${JSON.stringify(realUrl)}, __binder.namespace, __binder.set, __binder.get, ${JSON.stringify(originalSpecifier)})
`
  }

  // Bookkeeping shared by the async and sync wrap paths once `processModule`
  // succeeds: free the specifier entry early, and remember CJS modules so their
  // transitive require() chain bypasses iitm (see `load`). Returns the wrapper
  // module source.
  function onWrapSuccess (realUrl, context, originalSpecifier, setters, originNamespaces) {
    specifiers.delete(realUrl)
    // context.format is set to 'commonjs' by getCjsExports during processModule.
    if (context.format === 'commonjs') {
      cjsInIitmChain.add(realUrl)
    }
    return buildWrapperSource(realUrl, setters, originalSpecifier, originNamespaces)
  }

  // Bookkeeping shared by the async and sync wrap paths when `processModule`
  // throws. iitm falls back to the parent loader so the module loads unwrapped
  // (it just can't be Hook'ed) rather than taking down the whole app. We free
  // the specifier entry to avoid a leak, and log because a failure here is
  // usually an iitm bug and would otherwise be very tricky to debug.
  function onWrapFailure (realUrl, cause) {
    specifiers.delete(realUrl)
    const err = new Error(`'import-in-the-middle' failed to wrap '${realUrl}'`)
    err.cause = cause
    emitWarning(err)
  }

  async function getSource (url, context, parentGetSource) {
    if (hasIitm(url)) {
      const realUrl = deleteIitm(url)
      const originalSpecifier = specifiers.get(realUrl)

      try {
        const { setters, originNamespaces } = await driveAsync(
          processModule({ srcUrl: realUrl, context }),
          { resolve: cachedResolve, load: parentGetSource }
        )
        return { source: onWrapSuccess(realUrl, context, originalSpecifier, setters, originNamespaces) }
      } catch (cause) {
        onWrapFailure(realUrl, cause)
        // Revert back to the non-iitm URL
        url = realUrl
      }
    }

    return parentGetSource(url, context)
  }

  // Synchronous counterpart to `getSource`, for `module.registerHooks`. Drives
  // `processModule` straight through; all bookkeeping and source generation is
  // shared with `getSource`.
  function getSourceSync (url, context, nextLoad) {
    if (hasIitm(url)) {
      const realUrl = deleteIitm(url)
      const originalSpecifier = specifiers.get(realUrl)

      try {
        const { setters, originNamespaces } = driveSync(
          processModule({ srcUrl: realUrl, context }),
          { resolve: cachedResolve, load: nextLoad }
        )
        return { source: onWrapSuccess(realUrl, context, originalSpecifier, setters, originNamespaces) }
      } catch (cause) {
        onWrapFailure(realUrl, cause)
        url = realUrl
      }
    }

    return nextLoad(url, context)
  }

  async function load (url, context, parentLoad) {
    if (hasIitm(url)) {
      const result = await getSource(url, context, parentLoad)
      // If wrapping failed, `getSource()` may have fallen back to `parentLoad`,
      // which can legally return `source: null` (e.g. for non-JS formats).
      if (result && typeof result === 'object' && result.source != null) {
        return {
          source: result.source,
          shortCircuit: true,
          format: 'module'
        }
      }

      // Fall back to the parent loader with the original (non-iitm) URL.
      return parentLoad(deleteIitm(url), context)
    }

    // On Node 22+, when a CJS module is loaded through the ESM translator and
    // another loader hook provides its source (instead of leaving source null
    // for Node to read natively), require() calls inside that CJS module for
    // packages using the "module-sync" exports condition fail with
    // ERR_VM_MODULE_LINK_FAILURE. Work around this Node bug by stripping
    // hook-provided source for CJS modules in the synchronous require chain,
    // forcing Node to use its native CJS loader which handles this correctly.
    if (cjsInIitmChain.has(url)) {
      const result = await parentLoad(url, context)
      if (result.format === 'commonjs' && result.source != null) {
        return {
          format: result.format,
          source: undefined
        }
      }
      return result
    }

    return parentLoad(url, context)
  }

  // Synchronous counterpart to `load`, for `module.registerHooks`. Mirrors the
  // async `load` exactly — wrapping via `getSourceSync` and applying the same
  // CJS-in-iitm-chain source stripping — only without awaiting.
  function loadSync (url, context, nextLoad) {
    if (hasIitm(url)) {
      const result = getSourceSync(url, context, nextLoad)
      // If wrapping failed, `getSourceSync()` may have fallen back to `nextLoad`,
      // which can legally return `source: null` (e.g. for non-JS formats).
      if (result && typeof result === 'object' && result.source != null) {
        return {
          source: result.source,
          shortCircuit: true,
          format: 'module'
        }
      }

      // Fall back to the parent loader with the original (non-iitm) URL.
      return nextLoad(deleteIitm(url), context)
    }

    if (cjsInIitmChain.has(url)) {
      const result = nextLoad(url, context)
      if (result.format === 'commonjs' && result.source != null) {
        return {
          format: result.format,
          source: undefined
        }
      }
      return result
    }

    return nextLoad(url, context)
  }

  return { initialize, load, resolve, resolveSync, loadSync, applyOptions }
}
