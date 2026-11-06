// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { URL, fileURLToPath } from 'url'
import { inspect } from 'util'
import { builtinModules } from 'module'
import { isAbsolute } from 'path'
import { getModuleExports } from './lib/get-exports.mjs'
import { sourceToString } from './lib/get-esm-exports.mjs'
import { RESOLVE, driveSync, driveAsync } from './lib/io.mjs'
import { buildWrapperSource, processModule } from './lib/wrapper.mjs'
import { supportsSyncHooks } from './supports-sync-hooks.mjs'

// Re-exported for backwards compatibility: `supportsSyncHooks` now lives in its
// own import-free module so a CommonJS preloader can check it without loading
// this file's acorn / cjs-module-lexer dependency graph.
export { supportsSyncHooks }

const isWin = process.platform === 'win32'

// FIXME: Typescript extensions are added temporarily until we find a better
// way of supporting arbitrary extensions
const EXTENSION_RE = /\.(js|mjs|cjs|ts|mts|cts)$/
// The full es-module-lexer build handles erasable TypeScript syntax in the same
// pass as JavaScript, so the `-typescript` formats use the normal export path.
const HANDLED_FORMATS = new Set([
  'builtin', 'module', 'commonjs', 'module-typescript', 'commonjs-typescript'
])
const TRACE_WARNINGS = process.execArgv.includes('--trace-warnings')

/** @typedef {import('node:module').LoadHookContext} LoadContext */
/** @typedef {import('node:module').ResolveHookContext} ResolveContext */
/** @typedef {import('node:module').ResolveFnOutput} ResolveResult */
/** @typedef {import('node:module').LoadFnOutput} LoadResult */
/** @typedef {string | { specifier: string, format: 'module-typescript' | 'commonjs-typescript' }} SpecifierData */
/** @typedef {import('./lib/wrapper.mjs').StarBinding} StarBinding */
/** @typedef {import('./lib/wrapper.mjs').ModuleImportGraph} ModuleImportGraph */
/** @typedef {import('./lib/wrapper.mjs').ProcessResult} ProcessResult */

/** @param {string} url The module URL or specifier. */
function parseIitm (url) {
  const queryIndex = url.indexOf('?')
  if (queryIndex === -1 || url.indexOf('iitm', queryIndex) === -1) return
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('iitm')) return parsed
  } catch {}
}

/** @param {string} url The module URL or specifier. */
function hasIitm (url) {
  return parseIitm(url) !== undefined
}

/** @param {URL} parsedURL The parsed wrapper URL. */
function deleteIitm (parsedURL) {
  parsedURL.searchParams.delete('iitm')
  const resultUrl = parsedURL.href
  if (resultUrl.startsWith('file:///node:')) return resultUrl.slice('file:///'.length)
  return resultUrl
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
 * @param {string} url
 * @param {'true' | 'bindings'} [kind]
 */
function addIitm (url, kind = 'true') {
  if (url.indexOf('?') === -1) {
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) return `${url}?iitm=${kind}`
    return `${url.slice(0, hashIndex)}?iitm=${kind}${url.slice(hashIndex)}`
  }
  const urlObj = new URL(url)
  urlObj.searchParams.set('iitm', kind)
  return urlObj.href
}

/**
 * @param {{ url: string }} meta
 */
export function createHook (meta) {
  /** @type {Map<string, SpecifierData>} */
  const specifiers = new Map()
  let cachedResolve
  const iitmURL = new URL('lib/register.js', meta.url).toString()
  const createHookURL = meta.url.replace('hook.mjs', 'create-hook.mjs')
  let includeModules, excludeModules
  let shouldInclude = defaultShouldInclude
  let disableCjsSourceStripping = false
  /** @type {Map<string, Set<string>> | undefined} */
  let cyclicImportTargets
  /** @type {Map<string, string> | undefined} */
  let cyclicSources
  /** @type {Map<string, ModuleImportGraph> | undefined} */
  let moduleImportTargets

  /**
   * @param {string} url The module whose static imports are resolved.
   * @param {LoadContext} context Its metadata load context.
   */
  function * resolveImports (url, context) {
    const cached = moduleImportTargets?.get(url)
    if (cached !== undefined) return cached
    const { moduleImports } = yield * getModuleExports(url, context, undefined, true)
    const targets = []
    if (moduleImports !== undefined) {
      for (const imported of moduleImports) {
        const specifier = typeof imported === 'string' ? imported : imported.specifier
        const importAttributes = typeof imported === 'string' ? {} : Object.fromEntries(imported.attributes)
        const { url: target, format } = yield [RESOLVE, specifier, { parentURL: url, importAttributes }]
        targets.push({ url: target, format, importAttributes, graph: undefined })
      }
    }
    moduleImportTargets ??= new Map()
    const graph = { targets, acyclic: false }
    moduleImportTargets.set(url, graph)
    return graph
  }

  /**
   * @param {string} url The native module URL.
   * @param {LoadResult} result The actual native load result.
   */
  function prepareNativeSource (url, result) {
    const targets = cyclicImportTargets?.get(url)
    if (targets === undefined || targets.size === 0 ||
        (result.format !== 'module' && result.format !== 'module-typescript')) return result

    let bindingImports = ''
    if (result.source != null) {
      for (const target of targets) {
        bindingImports += `\nimport ${JSON.stringify(addIitm(target, 'bindings'))}\n`
      }
    }
    // A consumed target must not be queued again by a later barrel.
    targets.clear()
    if (bindingImports === '') return result
    // Original dependencies must initialize before the cycle's shared bindings.
    return { ...result, source: sourceToString(result.source) + bindingImports }
  }

  /**
   * @param {Set<string>} imports The cycle's closing importers.
   * @param {string} targetURL The wrapper root URL.
   */
  function mergeCyclicImports (imports, targetURL) {
    for (const parentURL of imports) {
      cyclicImportTargets ??= new Map()
      let targets = cyclicImportTargets.get(parentURL)
      if (targets === undefined) {
        targets = new Set()
        cyclicImportTargets.set(parentURL, targets)
      } else if (targets.size === 0) {
        continue
      }
      targets.add(targetURL)
    }
  }

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
  /**
   * @param {string} url The resolved module URL.
   * @param {string} specifier The original import specifier.
   */
  function defaultShouldInclude (url, specifier) {
    if (includeModules === undefined && excludeModules === undefined) return true

    let resultPath
    /** @param {string | RegExp} each The module filter. */
    function match (each) {
      if (each instanceof RegExp) return each.test(url)
      if (each === specifier || each === url) return true
      if (!isAbsolute(each)) return false

      if (resultPath === undefined) {
        resultPath = ''
        if (url.startsWith('file:')) {
          const stackTraceLimit = Error.stackTraceLimit
          Error.stackTraceLimit = 0
          try {
            resultPath = fileURLToPath(url)
          } catch {}
          Error.stackTraceLimit = stackTraceLimit
        }
      }
      return each === resultPath
    }

    return (includeModules === undefined || includeModules.some(match)) &&
      (excludeModules === undefined || !excludeModules.some(match))
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

    if (data.disableCjsSourceStripping === true) {
      disableCjsSourceStripping = true
    }

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
  /**
   * @param {{ url: string, format?: string }} result The resolved module.
   * @param {string} specifier The original module specifier.
   * @param {ResolveContext} context The resolve context.
   * @param {string} parentURL The importing module URL.
   * @param {boolean} binding Whether the request is for a cycle binding module.
   */
  function finishResolve (result, specifier, context, parentURL, binding) {
    // Do not wrap the entrypoint module. Many CLIs check whether they are the
    // "main" module (e.g. require.main === module). Wrapping changes how they
    // are evaluated, and can make them exit without doing anything.
    if (parentURL === '') {
      if (!EXTENSION_RE.test(result.url) && !hasIitm(result.url)) {
        // Extensionless CLIs can be ESM; preserve the format resolved by Node or an upstream loader.
        return { url: result.url, format: result.format ?? 'commonjs' }
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

    if (binding) {
      return { ...result, url: addIitm(result.url, 'bindings'), shortCircuit: true, format: 'module' }
    }

    // `shouldInclude` is always set (the include/exclude list matcher by default,
    // a consumer-provided predicate otherwise), so no nullish check is needed.
    if (!shouldInclude(result.url, specifier)) {
      return result
    }

    if (parentURL === meta.url || parentURL === createHookURL || (parentURL && hasIitm(parentURL))) {
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

    // Preserve the format before an outer loader can normalize it.
    if (result.format === 'module-typescript' || result.format === 'commonjs-typescript') {
      specifiers.set(result.url, { specifier, format: result.format })
    } else {
      specifiers.set(result.url, specifier)
    }

    return {
      url: addIitm(result.url),
      shortCircuit: true,
      // Node's synchronous resolver drops `format: 'builtin'` for bare builtin
      // specifiers (`require('crypto')` -> `node:crypto`), so restore it;
      // otherwise the load hook reads `node:crypto` from disk and throws ENOENT.
      format: result.format ?? (result.url.startsWith('node:') ? 'builtin' : undefined)
    }
  }

  /**
   * @param {string} specifier
   * @param {ResolveContext} context
   * @param {(specifier: string, context?: Partial<ResolveContext>) => ResolveResult | Promise<ResolveResult>} parentResolve
   */
  async function resolve (specifier, context, parentResolve) {
    cachedResolve = parentResolve

    const { parentURL = '' } = context

    // See https://github.com/nodejs/import-in-the-middle/pull/76.
    if (specifier === iitmURL) {
      return {
        url: specifier,
        shortCircuit: true
      }
    }

    const parsedURL = parseIitm(specifier)
    const binding = parsedURL?.searchParams.get('iitm') === 'bindings'
    const newSpecifier = parsedURL === undefined ? specifier : deleteIitm(parsedURL)
    if (isWin && parentURL.indexOf('file:node') === 0) {
      context.parentURL = ''
    }
    const result = await parentResolve(newSpecifier, context)

    return finishResolve(result, specifier, context, parentURL, binding)
  }

  // Synchronous counterpart to `resolve`, for `module.registerHooks`. The
  // synchronous `nextResolve` returns its result directly. We stash it so the
  // synchronous `load` hook can resolve star re-exports later, mirroring how
  // `resolve` caches `parentResolve`.
  /**
   * @param {string} specifier
   * @param {ResolveContext} context
   * @param {(specifier: string, context?: Partial<ResolveContext>) => ResolveResult} nextResolve
   */
  function resolveSync (specifier, context, nextResolve) {
    cachedResolve = nextResolve
    const { parentURL = '' } = context

    if (specifier === iitmURL) {
      return {
        url: specifier,
        shortCircuit: true
      }
    }

    const parsedURL = parseIitm(specifier)
    const binding = parsedURL?.searchParams.get('iitm') === 'bindings'
    const newSpecifier = parsedURL === undefined ? specifier : deleteIitm(parsedURL)
    if (isWin && parentURL.indexOf('file:node') === 0) {
      context.parentURL = ''
    }
    const result = nextResolve(newSpecifier, context)

    return finishResolve(result, specifier, context, parentURL, binding)
  }

  /**
   * Finalizes a successful wrap and builds its module source.
   *
   * @param {string} realUrl The URL of the wrapped module.
   * @param {string | undefined} format The wrapped module's loader format.
   * @param {string} originalSpecifier The original import specifier.
   * @param {ProcessResult} result The processed export bindings and cycle candidates.
   */
  function onWrapSuccess (realUrl, format, originalSpecifier, { bindings, cyclicImports }) {
    specifiers.delete(realUrl)
    if (format === 'commonjs') {
      cjsInIitmChain.add(realUrl)
    }
    if (cyclicImports === undefined) return buildWrapperSource(realUrl, bindings, originalSpecifier, format, iitmURL)

    const bindingURL = addIitm(realUrl, 'bindings')
    const { source, facadeSpecifiers } = buildWrapperSource(realUrl, bindings, originalSpecifier, format, iitmURL, undefined, true)
    cyclicSources ??= new Map()
    cyclicSources.set(bindingURL, source)
    mergeCyclicImports(cyclicImports, realUrl)
    return `
import ${JSON.stringify(realUrl)}
import __binder from ${JSON.stringify(bindingURL)}
export { ${facadeSpecifiers} } from ${JSON.stringify(bindingURL)}
import { register } from ${JSON.stringify(iitmURL)}
__binder.flushSync()
register(${JSON.stringify(realUrl)}, __binder, ${JSON.stringify(originalSpecifier)}, ${JSON.stringify(format)})
`
  }

  // Bookkeeping shared by the async and sync wrap paths when `processModule`
  // throws. iitm falls back to the parent loader so the module loads unwrapped
  // (it just can't be Hook'ed) rather than taking down the whole app. We free
  // the specifier entry to avoid a leak, and log because a failure here is
  // usually an iitm bug and would otherwise be very tricky to debug.
  /**
   * @param {string} realUrl The URL whose wrapper could not be built.
   * @param {unknown} cause The parse or wrapper-generation failure.
   */
  function onWrapFailure (realUrl, cause) {
    specifiers.delete(realUrl)
    const err = new Error(`'import-in-the-middle' failed to wrap '${realUrl}'`)
    err.cause = cause
    emitWarning(err)
  }

  /**
   * @param {string} url
   * @param {LoadContext} context
   * @param {(url: string, context?: Partial<LoadContext>) => LoadResult | Promise<LoadResult>} parentGetSource
   * @param {string} realUrl The original module URL.
   */
  async function getSource (url, context, parentGetSource, realUrl) {
    const specifierData = specifiers.get(realUrl)
    if (specifierData === undefined) {
      specifiers.delete(url)
      return parentGetSource(url, context)
    }

    let originalSpecifier = specifierData
    let processContext = context
    if (typeof specifierData !== 'string') {
      originalSpecifier = specifierData.specifier
      processContext = { ...context, format: specifierData.format }
    }

    try {
      const result = await driveAsync(
        processModule({ srcUrl: realUrl, context: processContext, resolveImports }),
        { resolve: cachedResolve, load: parentGetSource }
      )
      const source = onWrapSuccess(realUrl, result.format, originalSpecifier, result)
      return { source }
    } catch (cause) {
      onWrapFailure(realUrl, cause)
      // Revert back to the non-iitm URL
      url = realUrl
    }

    return parentGetSource(url, context)
  }

  // Synchronous counterpart to `getSource`, for `module.registerHooks`. Drives
  // `processModule` straight through; all bookkeeping and source generation is
  // shared with `getSource`.
  /**
   * @param {string} url
   * @param {LoadContext} context
   * @param {(url: string, context?: Partial<LoadContext>) => LoadResult} nextLoad
   * @param {string} realUrl The original module URL.
   */
  function getSourceSync (url, context, nextLoad, realUrl) {
    const specifierData = specifiers.get(realUrl)
    if (specifierData === undefined) {
      specifiers.delete(url)
      return nextLoad(url, context)
    }

    let originalSpecifier = specifierData
    let processContext = context
    if (typeof specifierData !== 'string') {
      originalSpecifier = specifierData.specifier
      processContext = { ...context, format: specifierData.format }
    }

    try {
      const result = driveSync(
        processModule({ srcUrl: realUrl, context: processContext, resolveImports }),
        { resolve: cachedResolve, load: nextLoad }
      )
      const source = onWrapSuccess(realUrl, result.format, originalSpecifier, result)
      return { source }
    } catch (cause) {
      onWrapFailure(realUrl, cause)
      url = realUrl
    }

    return nextLoad(url, context)
  }

  /**
   * @param {string} url
   * @param {LoadContext} context
   * @param {(url: string, context?: Partial<LoadContext>) => LoadResult | Promise<LoadResult>} parentLoad
   */
  async function load (url, context, parentLoad) {
    const parsedURL = parseIitm(url)
    if (parsedURL !== undefined) {
      if (parsedURL.searchParams.get('iitm') === 'bindings') {
        const source = cyclicSources?.get(url)
        if (source === undefined) return parentLoad(url, context)
        return { source, shortCircuit: true, format: 'module' }
      }
      const realUrl = deleteIitm(parsedURL)
      const result = await getSource(url, context, parentLoad, realUrl)
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
      return parentLoad(realUrl, context)
    }

    // On Node 22+, when a CJS module is loaded through the ESM translator and
    // another loader hook provides its source (instead of leaving source null
    // for Node to read natively), require() calls inside that CJS module for
    // packages using the "module-sync" exports condition fail with
    // ERR_VM_MODULE_LINK_FAILURE. Work around this Node bug by stripping
    // hook-provided source for CJS modules in the synchronous require chain,
    // forcing Node to use its native CJS loader which handles this correctly.
    if (cjsInIitmChain.has(url) && !disableCjsSourceStripping) {
      const result = await parentLoad(url, context)
      if (result.format === 'commonjs' && result.source != null) {
        return {
          format: result.format,
          source: undefined
        }
      }
      return result
    }

    return prepareNativeSource(url, await parentLoad(url, context))
  }

  // Synchronous counterpart to `load`, for `module.registerHooks`. Mirrors the
  // async `load` exactly — wrapping via `getSourceSync` and applying the same
  // CJS-in-iitm-chain source stripping — only without awaiting.
  /**
   * @param {string} url
   * @param {LoadContext} context
   * @param {(url: string, context?: Partial<LoadContext>) => LoadResult} nextLoad
   */
  function loadSync (url, context, nextLoad) {
    const parsedURL = parseIitm(url)
    if (parsedURL !== undefined) {
      if (parsedURL.searchParams.get('iitm') === 'bindings') {
        const source = cyclicSources?.get(url)
        if (source === undefined) return nextLoad(url, context)
        return { source, shortCircuit: true, format: 'module' }
      }
      const realUrl = deleteIitm(parsedURL)
      const result = getSourceSync(url, context, nextLoad, realUrl)
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
      return nextLoad(realUrl, context)
    }

    if (cjsInIitmChain.has(url) && !disableCjsSourceStripping) {
      const result = nextLoad(url, context)
      if (result.format === 'commonjs' && result.source != null) {
        return {
          format: result.format,
          source: undefined
        }
      }
      return result
    }

    return prepareNativeSource(url, nextLoad(url, context))
  }

  return { initialize, load, resolve, resolveSync, loadSync, applyOptions }
}
