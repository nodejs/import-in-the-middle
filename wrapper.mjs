// EXPERIMENTAL: this entry point may change in minor versions.
//
// Generates the same ESM facade IITM's loaders generate, for a module the
// caller selected, using the caller's source and resolve/load adapters, plus a
// manifest describing the facade's imports. It installs no loader hooks and
// shares no analysis state with them.

import Module from 'module'
import { types } from 'util'

import { createAnalysisState } from './lib/get-exports.mjs'
import { driveAsync, driveSync } from './lib/io.mjs'
import { buildWrapperSource, processModule } from './lib/wrapper.mjs'

const NAME = "'import-in-the-middle' createWrapperModule"
const runtimeUrl = new URL('lib/register.js', import.meta.url).href
// Facades import only these relative placeholders. Callers map them to real
// modules through the returned `imports` manifest.
const RUNTIME_SPECIFIER = './__iitm_runtime__.js'
const MODULE_SPECIFIER_PREFIX = './__iitm_module_'

function noop () {}

// A builtin root has no module graph, so its adapters are never called.
function unusedAdapter () {
  throw new Error(`${NAME}: adapter called for a builtin root`)
}

/**
 * @param {string} url A `node:` URL.
 */
function isBuiltinUrl (url) {
  if (typeof Module.isBuiltin === 'function') return Module.isBuiltin(url)
  // Before Node.js 18.6 there is no `isBuiltin`, and `builtinModules` omits
  // `node:`-only builtins such as `node:test`. Analysis loads the builtin
  // anyway, so loading it here costs nothing extra.
  if (Module.builtinModules.includes(url.slice('node:'.length))) return true
  try {
    Module.createRequire(import.meta.url)(url)
    return true
  } catch {
    return false
  }
}

/** @param {unknown} value */
function isThenable (value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
}

/**
 * Throws when a synchronous adapter returned a thenable. The thenable is
 * observed first so a later rejection is not reported as unhandled.
 *
 * @param {unknown} value
 * @param {string} adapter
 * @param {string} target
 */
function assertNotThenable (value, adapter, target) {
  if (isThenable(value)) {
    value.then(noop, noop)
    throw new TypeError(`${NAME}: ${adapter}() returned a Promise for '${target}', but sync: true requires a synchronous result`)
  }
}

/**
 * @param {unknown} format
 * @param {string} adapter
 * @param {string} target
 */
function checkFormat (format, adapter, target) {
  if (format != null && typeof format !== 'string') {
    throw new TypeError(`${NAME}: ${adapter}() must return a string format for '${target}'`)
  }
}

/**
 * @param {unknown} result
 * @param {string} specifier
 */
function checkResolved (result, specifier) {
  if (result === null || typeof result !== 'object' || typeof result.url !== 'string' || !isAbsoluteUrl(result.url)) {
    throw new TypeError(`${NAME}: resolve() must return an object with an absolute URL string as url for '${specifier}'`)
  }
  checkFormat(result.format, 'resolve', specifier)
  return result
}

/**
 * @param {unknown} result
 * @param {string} url
 * @param {string | undefined} resolvedFormat
 */
function checkLoaded (result, url, resolvedFormat) {
  if (result === null || typeof result !== 'object') {
    throw new TypeError(`${NAME}: load() must return an object for '${url}'`)
  }
  const { source, format } = result
  checkFormat(format, 'load', url)
  if (source != null && typeof source !== 'string' && !types.isAnyArrayBuffer(source) && !ArrayBuffer.isView(source)) {
    throw new TypeError(`${NAME}: load() must return a string, ArrayBuffer or typed array source for '${url}'`)
  }
  // Builtins are recognized from `resolve` and never reach `load`, so a
  // `builtin` format here names a module that is not a builtin.
  if (format === 'builtin') {
    throw new TypeError(`${NAME}: load() returned format 'builtin' for '${url}', which is not a builtin; resolve builtins to a node: URL`)
  }
  // The shared analyzer expects the effective format on the load result.
  // Keep resolve's format unless load overrides it, without mutating the
  // caller's result (which may be cached or frozen).
  return { source, format: format ?? resolvedFormat }
}

/** @param {string} url */
function isAbsoluteUrl (url) {
  if (typeof URL.canParse === 'function') {
    return URL.canParse(url)
  }
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} url
 * @param {string | undefined} format
 */
function isExternal (url, format) {
  return url.startsWith('node:') || format === 'builtin'
}

/**
 * Validates options and builds the graph I/O for one call. Root source is
 * served from `options.source`, or analyzed as a builtin for a `node:` root;
 * builtins never reach the caller's `load`. The I/O also records, for this call
 * only, the formats the adapters report and the files the facade depends on.
 *
 * @param {object} options
 * @param {boolean} sync
 */
function prepare (options, sync) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${NAME}: options must be an object`)
  }
  const { url, source, specifier } = options
  let { resolve, load } = options
  if (options.sync !== undefined && typeof options.sync !== 'boolean') {
    throw new TypeError(`${NAME}: options.sync must be a boolean`)
  }
  if (typeof url !== 'string' || !isAbsoluteUrl(url)) {
    throw new TypeError(`${NAME}: options.url must be an absolute URL string`)
  }
  const builtin = url.startsWith('node:')
  if (builtin) {
    if (!isBuiltinUrl(url)) {
      throw new TypeError(`${NAME}: options.url '${url}' is not a Node.js builtin`)
    }
    if (source !== undefined) {
      throw new TypeError(`${NAME}: options.source must be omitted for the builtin '${url}'`)
    }
    resolve ??= unusedAdapter
    load ??= unusedAdapter
  } else if (typeof source !== 'string') {
    throw new TypeError(`${NAME}: options.source must be a string of ESM JavaScript`)
  }
  if (typeof specifier !== 'string') {
    throw new TypeError(`${NAME}: options.specifier must be a string`)
  }
  for (const [name, value] of [['resolve', resolve], ['load', load]]) {
    if (typeof value !== 'function') {
      throw new TypeError(`${NAME}: options.${name} must be a function`)
    }
  }

  /** @type {Set<string>} */
  const watchFiles = new Set()
  // A format from load overrides one from resolve, regardless of call order.
  // The first report per URL is kept, matching the per-call analysis cache.
  /** @type {Map<string, string>} */
  const loadedFormats = new Map()
  /** @type {Map<string, string>} */
  const resolvedFormats = new Map()

  /**
   * @param {unknown} files
   * @param {string} adapter
   * @param {string} target
   */
  function addWatchFiles (files, adapter, target) {
    if (files === undefined) return
    if (files === null || typeof files !== 'object' || typeof files[Symbol.iterator] !== 'function') {
      throw new TypeError(`${NAME}: ${adapter}() must return watchFiles as an iterable of absolute URL strings for '${target}'`)
    }
    for (const file of files) {
      if (typeof file !== 'string' || !isAbsoluteUrl(file)) {
        throw new TypeError(`${NAME}: ${adapter}() returned a watchFiles entry that is not an absolute URL string for '${target}'`)
      }
      watchFiles.add(file)
    }
  }

  /**
   * @param {unknown} result
   * @param {string} target
   */
  function recordResolved (result, target) {
    const resolved = checkResolved(result, target)
    addWatchFiles(resolved.watchFiles, 'resolve', target)
    if (resolved.format != null && !resolvedFormats.has(resolved.url)) {
      resolvedFormats.set(resolved.url, resolved.format)
    }
    return resolved
  }

  /**
   * @param {unknown} result
   * @param {string} target
   * @param {string | undefined} resolvedFormat
   */
  function recordLoaded (result, target, resolvedFormat) {
    const loaded = checkLoaded(result, target, resolvedFormat)
    addWatchFiles(result.watchFiles, 'load', target)
    if (loaded.format != null && !loadedFormats.has(target)) loadedFormats.set(target, loaded.format)
    return loaded
  }

  /** @param {string} target */
  function recordAnalyzed (target) {
    if (target.startsWith('file:')) watchFiles.add(target)
  }

  /**
   * @param {string} target
   * @param {{ format?: string }} context
   */
  function isBuiltin (target, context) {
    return target.startsWith('node:') || context.format === 'builtin'
  }

  const root = builtin ? { source: null, format: 'builtin' } : { source, format: 'module' }
  loadedFormats.set(url, root.format)
  let io
  if (sync) {
    io = {
      resolve (target, context) {
        const result = resolve(target, { parentURL: context.parentURL, kind: context.kind ?? 'import' })
        assertNotThenable(result, 'resolve', target)
        return recordResolved(result, target)
      },
      load (target, context) {
        recordAnalyzed(target)
        if (target === url) return root
        if (isBuiltin(target, context)) return { source: null, format: 'builtin' }
        const result = load(target, { format: context.format })
        assertNotThenable(result, 'load', target)
        return recordLoaded(result, target, context.format)
      }
    }
  } else {
    io = {
      async resolve (target, context) {
        return recordResolved(await resolve(target, { parentURL: context.parentURL, kind: context.kind ?? 'import' }), target)
      },
      async load (target, context) {
        recordAnalyzed(target)
        if (target === url) return root
        if (isBuiltin(target, context)) return { source: null, format: 'builtin' }
        return recordLoaded(await load(target, { format: context.format }), target, context.format)
      }
    }
  }

  return {
    io,
    analysis: processModule({ srcUrl: url, context: { format: root.format }, state: createAnalysisState() }),
    render ({ bindings, format }) {
      const imports = [{
        specifier: RUNTIME_SPECIFIER,
        kind: 'runtime',
        target: { url: runtimeUrl, format: 'commonjs' },
        external: false
      }]
      /** @type {Map<string, string>} */
      const specifiers = new Map()

      /** @param {string} target */
      function mapModule (target) {
        let placeholder = specifiers.get(target)
        if (placeholder === undefined) {
          placeholder = `${MODULE_SPECIFIER_PREFIX}${specifiers.size}__.js`
          specifiers.set(target, placeholder)
          const targetFormat = loadedFormats.get(target) ?? resolvedFormats.get(target) ??
            (target.startsWith('node:') ? 'builtin' : undefined)
          imports.push({
            specifier: placeholder,
            kind: 'module',
            target: targetFormat === undefined ? { url: target } : { url: target, format: targetFormat },
            external: isExternal(target, targetFormat)
          })
        }
        return placeholder
      }

      // The wrapped module is always the first module placeholder.
      mapModule(url)
      const code = buildWrapperSource(url, bindings, specifier, format, RUNTIME_SPECIFIER, mapModule)
      return { code, imports, watchFiles: Array.from(watchFiles), sideEffects: true }
    }
  }
}

/** @param {object} options */
function createWrapperModuleSync (options) {
  const { io, analysis, render } = prepare(options, true)
  return render(driveSync(analysis, io))
}

/** @param {object} options */
async function createWrapperModuleAsync (options) {
  const { io, analysis, render } = prepare(options, false)
  return render(await driveAsync(analysis, io))
}

/**
 * EXPERIMENTAL: this API may change in minor versions.
 *
 * Generates an IITM-style ESM facade for a caller-selected ESM module, or for a
 * Node.js builtin given as a `node:` URL, without installing IITM's loader
 * hooks. The facade imports the original module and IITM's registration
 * runtime through relative placeholder specifiers, re-exports its bindings, and
 * registers the module with `Hook`/`addHook` under the canonical `url`.
 *
 * Returns `{ code, imports, watchFiles, sideEffects: true }`, where `imports`
 * maps each placeholder to its target and `watchFiles` lists the analyzed
 * `file:` URLs and the adapters' watch files. The result is a Promise unless
 * `sync` is `true`, which requires `resolve` and `load` to return
 * synchronously. The mode is chosen only by `sync`.
 *
 * @param {object} options See `wrapper.d.mts`.
 * @returns {object | Promise<object>}
 */
export function createWrapperModule (options) {
  if (options !== null && typeof options === 'object' && options.sync === true) {
    return createWrapperModuleSync(options)
  }
  return createWrapperModuleAsync(options)
}
