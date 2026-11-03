// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const { existsSync } = require('node:fs')
const Module = require('node:module')
const { dirname, join, sep } = require('node:path')
const { fileURLToPath, pathToFileURL } = require('node:url')
const { isInternalThread } = require('node:worker_threads')

const requireModule = Module.createRequire(__filename)
const supportsSyncHooks = require('./supports-sync-hooks.js')
const { parseIitm, deleteIitm } = require('./iitm-url.js')

/** @typedef {import('../index').HookFunction} ImportHook */
/** @typedef {[string, object, string?, string?]} Record */
/** @typedef {{ importHooks: ImportHook[], specifiers: Map<string, string>, toHook: Record[] }} Registry */

// Compatible implementations share registrations, but keep their binding state local.
const key = Symbol.for('import-in-the-middle.registry.v1')
const registry = globalThis[key] ??= { importHooks: [], specifiers: new Map(), toHook: [] }
const registerSuffix = `${sep}lib${sep}register.js`

/**
 * @param {string} name
 * @param {string | undefined} specifier
 */
function setSpecifier (name, specifier) {
  registry.specifiers.set(name, specifier ?? registry.specifiers.get(name))
}

/** @param {Partial<Registry> | undefined} candidate */
function isRegistry (candidate) {
  return Array.isArray(candidate?.importHooks) && Array.isArray(candidate.toHook) && candidate.specifiers instanceof Map
}

/** @param {Registry} legacy */
function adapt (legacy) {
  if (!isRegistry(legacy) || legacy.importHooks === registry.importHooks || registry.adapted.has(legacy)) return
  registry.adapted.add(legacy)

  const oldHooks = legacy.importHooks.slice()
  const oldRecords = legacy.toHook.slice()
  const currentHooks = registry.importHooks.slice()
  const currentRecords = registry.toHook.slice()
  for (const [name, specifier] of legacy.specifiers) {
    setSpecifier(name, specifier)
  }
  legacy.importHooks.length = 0
  legacy.toHook.length = 0
  legacy.specifiers.clear()
  for (const method of ['push', 'forEach', 'indexOf', 'splice']) {
    legacy.importHooks[method] = registry.importHooks[method].bind(registry.importHooks)
  }
  for (const method of ['push', 'forEach']) {
    legacy.toHook[method] = registry.toHook[method].bind(registry.toHook)
  }
  legacy.specifiers.get = registry.specifiers.get.bind(registry.specifiers)
  /**
   * @param {string} name
   * @param {string | undefined} specifier
   */
  legacy.specifiers.set = function set (name, specifier) {
    setSpecifier(name, specifier)
    return legacy.specifiers
  }
  for (const hook of oldHooks) registry.importHooks.push(hook)
  for (const record of oldRecords) registry.toHook.push(record)
  for (const [name, namespace, specifier, format] of oldRecords) {
    for (const hook of currentHooks) hook(name, namespace, specifier, format)
  }
  for (const [name, namespace, specifier, format] of currentRecords) {
    for (const hook of oldHooks) hook(name, namespace, specifier, format)
  }

  if (!registry.resolver && supportsSyncHooks()) {
    registry.resolver = Module.registerHooks({
      /**
       * @param {string} specifier
       * @param {import('node:module').ResolveHookContext} context
       * @param {import('node:module').ResolveHookSync} nextResolve
       */
      resolve (specifier, context, nextResolve) {
        const result = nextResolve(specifier, context)
        const parsed = parseIitm(result.url)
        if (parsed !== undefined && parseIitm(specifier) === undefined &&
            (context.parentURL === undefined || parseIitm(context.parentURL) === undefined)) {
          registry.specifiers.set(deleteIitm(parsed), specifier)
        }
        return result
      }
    })
  }
}

/** @param {string} manifest */
function isCompatiblePackage (manifest) {
  if (!existsSync(manifest)) return false
  const { name, version } = requireModule(manifest)
  return name === 'import-in-the-middle' && version?.startsWith('3.')
}

/** @param {NodeModule} loaded */
function inspectRegistry (loaded) {
  const { filename } = loaded
  const manifest = join(dirname(filename), '..', 'package.json')
  if (!isCompatiblePackage(manifest)) return
  adapt(loaded.exports)
}

if (!isInternalThread && !registry.adapted) {
  registry.adapted = new WeakSet()
  const compile = Module.prototype._compile
  /**
   * @param {string} content
   * @param {string} filename
   */
  Module.prototype._compile = function compileWithLegacyRegistry (content, filename) {
    const result = compile.apply(this, arguments)
    if (filename.endsWith(registerSuffix)) inspectRegistry(this)
    return result
  }
  for (const loaded of Object.values(requireModule.cache)) {
    if (loaded?.loaded && loaded.filename?.endsWith(registerSuffix)) inspectRegistry(loaded)
  }
}

/** @param {string} url */
function quoteFileUrl (url) {
  return `'${url.replaceAll("'", '%27')}'`
}

/** @param {string} url */
function legacyLoaderSource (url) {
  if (!url.startsWith('file:') || !url.endsWith('/hook.mjs')) return
  if (url === pathToFileURL(join(__dirname, '..', 'hook.mjs')).href) return
  const manifest = fileURLToPath(new URL('./package.json', url))
  if (!isCompatiblePackage(manifest)) return
  const legacy = requireModule(fileURLToPath(new URL('./lib/register.js', url)))
  if (!isRegistry(legacy) || legacy.importHooks === registry.importHooks) return
  const original = quoteFileUrl(`${url}?iitm-legacy-loader`)
  const urlHelpers = quoteFileUrl(pathToFileURL(join(__dirname, 'iitm-url.js')).href)
  return `import { load as legacyLoad, resolve as legacyResolve } from ${original}
import { parseIitm, deleteIitm } from ${urlHelpers}
export * from ${original}
const delegated = new Set()
/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export async function resolve (specifier, context, nextResolve) {
  let wrappedUrl
  const result = await legacyResolve(specifier, context,
    /**
     * @param {string} name
     * @param {import('node:module').ResolveHookContext} options
     */
    async (name, options) => {
      const result = await nextResolve(name, options)
      const parsed = parseIitm(result.url)
      if (parsed !== undefined) wrappedUrl = result.url
      return parsed === undefined ? result : { ...result, url: deleteIitm(parsed) }
    })
  if (wrappedUrl !== undefined && parseIitm(result.url) === undefined) {
    delegated.add(wrappedUrl)
    return { ...result, url: wrappedUrl }
  }
  return result
}
/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export async function load (url, context, nextLoad) {
  return delegated.delete(url) ? nextLoad(url, context) : legacyLoad(url, context, nextLoad)
}
`
}

module.exports = { registry, legacyLoaderSource }
