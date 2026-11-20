// EXPERIMENTAL: not covered by semantic versioning. This API may change or
// be removed in any release, including patch releases, without a
// deprecation period.
//
// Generates the same ESM facade IITM's loaders generate, for a module the
// caller selected, using the caller's source and resolve/load adapters, plus a
// manifest of the facade's imports. It installs no loader hooks and shares no
// module analysis with them; only builtin export names are cached process-wide.

import Module from 'module'
import { types } from 'util'

import { createAnalysisState } from '../lib/get-exports.mjs'
import { driveAsync, driveSync } from '../lib/io.mjs'
import { buildWrapperSource, processModule } from '../lib/wrapper.mjs'

const runtimeUrl = new URL('../lib/register.js', import.meta.url).href
const RUNTIME_SPECIFIER = './__iitm_runtime__.js'
const MODULE_SPECIFIER_PREFIX = './__iitm_module_'
const BUILTIN = Object.freeze({ source: null, format: 'builtin' })

/** @param {string} name */
function prefix (name) {
  return `'import-in-the-middle' ${name}()`
}

/** @param {unknown} source */
function isSource (source) {
  return typeof source === 'string' || types.isAnyArrayBuffer(source) || ArrayBuffer.isView(source)
}

/** @param {string} url A `node:` URL. */
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
function isAbsoluteUrl (url) {
  if (typeof URL.canParse === 'function') return URL.canParse(url)
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Validates and normalizes a `resolve` result. Builtins are exactly the
 * `node:` URLs, always with the format `builtin`.
 *
 * @param {string} name
 * @param {unknown} result
 * @param {string} specifier
 * @returns {{ url: string, format?: string }}
 */
function checkResolved (name, result, specifier) {
  if (result === null || typeof result !== 'object' || typeof result.url !== 'string' || !isAbsoluteUrl(result.url)) {
    throw new TypeError(`${prefix(name)}: resolve() must return an object with an absolute URL string as url for '${specifier}'`)
  }
  const { url, format } = result
  if (format != null && typeof format !== 'string') {
    throw new TypeError(`${prefix(name)}: resolve() must return a string format for '${specifier}'`)
  }
  if (url.startsWith('node:')) {
    if (!isBuiltinUrl(url)) {
      throw new TypeError(`${prefix(name)}: resolve() returned '${url}' for '${specifier}', which is not a Node.js builtin`)
    }
    if (format != null && format !== 'builtin') {
      throw new TypeError(`${prefix(name)}: resolve() returned format '${format}' for the builtin '${url}'`)
    }
    return { url, format: 'builtin' }
  }
  if (format === 'builtin') {
    throw new TypeError(`${prefix(name)}: resolve() returned format 'builtin' for '${url}'; resolve builtins to a node: URL`)
  }
  return format == null ? { url } : { url, format }
}

/**
 * Validates a `load` result and returns the effective source and format.
 * Load's format overrides resolve's; without one, resolve's is kept. The
 * caller's result is not mutated, as it may be cached or frozen.
 *
 * @param {string} name
 * @param {unknown} result
 * @param {string} url
 * @param {string | undefined} resolvedFormat
 */
function checkLoaded (name, result, url, resolvedFormat) {
  if (result === null || typeof result !== 'object') {
    throw new TypeError(`${prefix(name)}: load() must return an object for '${url}'`)
  }
  const { source, format } = result
  if (format != null && typeof format !== 'string') {
    throw new TypeError(`${prefix(name)}: load() must return a string format for '${url}'`)
  }
  // Builtins are recognized from `resolve` and never reach `load`.
  if (format === 'builtin') {
    throw new TypeError(`${prefix(name)}: load() returned format 'builtin' for '${url}'; resolve builtins to a node: URL`)
  }
  if (source == null) {
    throw new TypeError(`${prefix(name)}: load() returned no source for '${url}'`)
  }
  if (!isSource(source)) {
    throw new TypeError(`${prefix(name)}: load() must return a string, ArrayBuffer or typed array source for '${url}'`)
  }
  return { source, format: format ?? resolvedFormat }
}

/**
 * Validates the options and builds the graph I/O for one call. The root is
 * served from `options.source`, or analyzed as a builtin for a `node:` root,
 * and builtins never reach the caller's `load`. Adapters are required only
 * when analysis needs them. The I/O records the effective format of every
 * module it serves, for the manifest.
 *
 * @param {object} options
 * @param {string} name The calling function, for error messages.
 * @param {boolean} sync Whether the adapters must return synchronously.
 */
function prepare (options, name, sync) {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${prefix(name)}: options must be an object`)
  }
  const { url, source, specifier, resolve, load } = options
  if (typeof url !== 'string' || !isAbsoluteUrl(url)) {
    throw new TypeError(`${prefix(name)}: options.url must be an absolute URL string`)
  }
  let root = { source, format: 'module' }
  if (url.startsWith('node:')) {
    if (!isBuiltinUrl(url)) {
      throw new TypeError(`${prefix(name)}: options.url '${url}' is not a Node.js builtin`)
    }
    if (source !== undefined) {
      throw new TypeError(`${prefix(name)}: options.source must be omitted for the builtin '${url}'`)
    }
    root = BUILTIN
  } else if (!isSource(source)) {
    throw new TypeError(`${prefix(name)}: options.source must be a string, ArrayBuffer or typed array of ESM JavaScript`)
  }
  if (typeof specifier !== 'string') {
    throw new TypeError(`${prefix(name)}: options.specifier must be a string`)
  }
  if (resolve !== undefined && typeof resolve !== 'function') {
    throw new TypeError(`${prefix(name)}: options.resolve must be a function`)
  }
  if (load !== undefined && typeof load !== 'function') {
    throw new TypeError(`${prefix(name)}: options.load must be a function`)
  }

  // The first effective format served per URL, reported in the manifest.
  /** @type {Map<string, string | undefined>} */
  const formats = new Map([[url, root.format]])

  /**
   * Serves the root and builtins; anything else comes from the caller.
   *
   * @param {string} target
   * @returns {object | undefined}
   */
  function serveKnown (target) {
    if (target === url) return root
    if (target.startsWith('node:')) {
      formats.set(target, 'builtin')
      return BUILTIN
    }
  }

  /**
   * @param {unknown} result
   * @param {string} target
   * @param {string | undefined} resolvedFormat
   */
  function recordLoaded (result, target, resolvedFormat) {
    const loaded = checkLoaded(name, result, target, resolvedFormat)
    if (!formats.has(target)) formats.set(target, loaded.format)
    return loaded
  }

  /**
   * @param {string} target
   * @param {{ parentURL: string, kind?: 'import' | 'require' }} context
   */
  function resolveWithAdapter (target, context) {
    if (resolve === undefined) {
      throw new TypeError(`${prefix(name)}: resolve() is required to analyze '${target}' re-exported by '${context.parentURL}'`)
    }
    return resolve(target, { parentURL: context.parentURL, kind: context.kind ?? 'import' })
  }

  /**
   * @param {string} target
   * @param {{ format?: string }} context
   */
  function loadWithAdapter (target, context) {
    // Without `load`, analysis stops at the first module it needs, which only
    // the root's own source can have re-exported.
    if (load === undefined) {
      throw new TypeError(`${prefix(name)}: load() is required to analyze '${target}' re-exported by '${url}'`)
    }
    return load(target, { format: context.format })
  }

  let io
  if (sync) {
    io = {
      resolve: function syncResolve (target, context) {
        return checkResolved(name, resolveWithAdapter(target, context), target)
      },
      load: function syncLoad (target, context) {
        const known = serveKnown(target)
        if (known !== undefined) return known
        return recordLoaded(loadWithAdapter(target, context), target, context.format)
      }
    }
  } else {
    io = {
      resolve: async function asyncResolve (target, context) {
        return checkResolved(name, await resolveWithAdapter(target, context), target)
      },
      load: async function asyncLoad (target, context) {
        const known = serveKnown(target)
        if (known !== undefined) return known
        return recordLoaded(await loadWithAdapter(target, context), target, context.format)
      }
    }
  }

  const analysis = processModule({ srcUrl: url, context: { format: root.format }, state: createAnalysisState() })
  return { url, specifier, formats, io, analysis }
}

/**
 * Builds the facade and its manifest from the analyzed bindings.
 *
 * @param {{ url: string, specifier: string, formats: Map<string, string | undefined> }} call
 * @param {import('../lib/wrapper.mjs').ProcessResult} result
 */
function render ({ url, specifier, formats }, { bindings, format }) {
  const imports = [{ specifier: RUNTIME_SPECIFIER, kind: 'runtime', url: runtimeUrl, format: 'commonjs' }]
  /** @type {Map<string, string>} */
  const placeholders = new Map()

  /** @param {string} target */
  function mapModule (target) {
    let placeholder = placeholders.get(target)
    if (placeholder === undefined) {
      placeholder = `${MODULE_SPECIFIER_PREFIX}${placeholders.size}__.js`
      placeholders.set(target, placeholder)
      const entry = { specifier: placeholder, kind: target === url ? 'original' : 'module', url: target }
      const targetFormat = formats.get(target)
      if (targetFormat !== undefined) entry.format = targetFormat
      imports.push(entry)
    }
    return placeholder
  }

  // Number the original first, before the defining modules of star bindings.
  mapModule(url)
  const code = buildWrapperSource(url, bindings, specifier, format, RUNTIME_SPECIFIER, mapModule)
  return { code, imports }
}

/**
 * EXPERIMENTAL: not covered by semantic versioning. This API may change or
 * be removed in any release, including patch releases, without a
 * deprecation period.
 *
 * Generates an IITM ESM facade for a caller-selected ESM module, or for a
 * Node.js builtin given as a `node:` URL, without installing IITM's loader
 * hooks. Adapters are required only when analysis needs them and may return
 * values or Promises. Invalid options and adapter failures reject the returned
 * Promise.
 *
 * @param {object} options See `../wrapper.d.mts`.
 * @returns {Promise<{ code: string, imports: object[] }>}
 */
export async function createWrapperModule (options) {
  const call = prepare(options, 'createWrapperModule', false)
  return render(call, await driveAsync(call.analysis, call.io))
}

/**
 * EXPERIMENTAL: not covered by semantic versioning. This API may change or
 * be removed in any release, including patch releases, without a
 * deprecation period.
 *
 * Synchronous {@link createWrapperModule}, for synchronous hooks such as
 * `module.registerHooks()`. `resolve` and `load` must return synchronously.
 *
 * @param {object} options See `../wrapper.d.mts`.
 * @returns {{ code: string, imports: object[] }}
 */
export function createWrapperModuleSync (options) {
  const call = prepare(options, 'createWrapperModuleSync', true)
  return render(call, driveSync(call.analysis, call.io))
}
