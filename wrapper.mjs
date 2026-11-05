// EXPERIMENTAL: this entry point may change in minor versions.
//
// Generates the same ESM facade IITM's loaders generate, for a module the
// caller selected, using the caller's source and resolve/load adapters. It
// installs no loader hooks and shares no analysis state with them.

import Module from 'module'
import { types } from 'util'

import { createAnalysisState } from './lib/get-exports.mjs'
import { driveAsync, driveSync } from './lib/io.mjs'
import { buildWrapperSource, processModule } from './lib/wrapper.mjs'

const NAME = "'import-in-the-middle' createWrapperModule"
const runtimeUrl = new URL('lib/register.js', import.meta.url).href

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

/** @param {string} url */
function identity (url) {
  return url
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
 * @param {unknown} result
 * @param {string} specifier
 */
function checkResolved (result, specifier) {
  if (result === null || typeof result !== 'object' || typeof result.url !== 'string' || !isAbsoluteUrl(result.url)) {
    throw new TypeError(`${NAME}: resolve() must return an object with an absolute URL string as url for '${specifier}'`)
  }
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
 * Validates options and builds the graph I/O for one call. Root source is
 * served from `options.source`, or analyzed as a builtin for a `node:` root;
 * builtins never reach the caller's `load`.
 *
 * @param {object} options
 * @param {boolean} sync
 */
function prepare (options, sync) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${NAME}: options must be an object`)
  }
  const { url, source, specifier, mapImport = identity } = options
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
  for (const [name, value] of [['resolve', resolve], ['load', load], ['mapImport', mapImport]]) {
    if (typeof value !== 'function') {
      throw new TypeError(`${NAME}: options.${name} must be a function`)
    }
  }

  /**
   * @param {string} target
   * @param {'module' | 'runtime'} kind
   */
  function mapSpecifier (target, kind) {
    const mapped = mapImport(target, kind)
    if (typeof mapped !== 'string' || mapped === '') {
      if (isThenable(mapped)) mapped.then(noop, noop)
      throw new TypeError(`${NAME}: mapImport() must synchronously return a non-empty string for '${target}'`)
    }
    return mapped
  }

  /**
   * @param {string} target
   * @param {{ format?: string }} context
   */
  function isBuiltin (target, context) {
    return target.startsWith('node:') || context.format === 'builtin'
  }

  const root = builtin ? { source: null, format: 'builtin' } : { source, format: 'module' }
  const io = sync
    ? {
        resolve (target, context) {
          const result = resolve(target, { parentURL: context.parentURL, kind: context.kind ?? 'import' })
          assertNotThenable(result, 'resolve', target)
          return checkResolved(result, target)
        },
        load (target, context) {
          if (target === url) return root
          if (isBuiltin(target, context)) return { source: null, format: 'builtin' }
          const result = load(target, { format: context.format })
          assertNotThenable(result, 'load', target)
          return checkLoaded(result, target, context.format)
        }
      }
    : {
        async resolve (target, context) {
          return checkResolved(await resolve(target, { parentURL: context.parentURL, kind: context.kind ?? 'import' }), target)
        },
        async load (target, context) {
          if (target === url) return root
          if (isBuiltin(target, context)) return { source: null, format: 'builtin' }
          return checkLoaded(await load(target, { format: context.format }), target, context.format)
        }
      }

  return {
    io,
    analysis: processModule({ srcUrl: url, context: { format: root.format }, state: createAnalysisState() }),
    render ({ bindings, format }) {
      const runtime = mapSpecifier(runtimeUrl, 'runtime')
      return buildWrapperSource(url, bindings, specifier, format, runtime, (target) => mapSpecifier(target, 'module'))
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
 * runtime through `mapImport`, re-exports its bindings, and registers the
 * module with `Hook`/`addHook` under the canonical `url`.
 *
 * Returns a `Promise<string>` unless `sync` is `true`, in which case it returns
 * a `string` and requires `resolve`, `load` and `mapImport` to return
 * synchronously. The mode is chosen only by `sync`.
 *
 * @param {object} options See `wrapper.d.mts`.
 * @returns {string | Promise<string>}
 */
export function createWrapperModule (options) {
  return options !== null && typeof options === 'object' && options.sync === true
    ? createWrapperModuleSync(options)
    : createWrapperModuleAsync(options)
}
