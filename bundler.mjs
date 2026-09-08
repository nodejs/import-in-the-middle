'use strict'

import { builtinModules } from 'module'

import { driveAsync } from './lib/io.mjs'
import {
  buildCommonJSWrapperSource,
  buildWrapperSourceWithData,
  processModule,
  resolveExportBindings
} from './lib/wrapper.mjs'

const RUNTIME_SPECIFIER = './__iitm_runtime__.js'
const MODULE_SPECIFIER_PREFIX = './__iitm_module_'
const runtimeUrl = new URL('./lib/bundler-runtime.js', import.meta.url).href

/**
 * @typedef {object} BundlerModule
 * @property {string} url
 * @property {string} format
 * @property {string} specifier
 * @property {string | ArrayBuffer | ArrayBufferView} [source]
 * @property {unknown} [data]
 * @property {Iterable<string> | ((exports: ReadonlyArray<{
 *   name: string,
 *   url: string,
 *   localName?: string
 * }>) => Iterable<string>)} [passthroughExports]
 */

/**
 * @typedef {object} ModuleContext
 * @property {string} [format]
 * @property {string} [parentURL]
 */

/**
 * @typedef {object} ResolveResult
 * @property {string} url
 * @property {string} [format]
 * @property {Iterable<string>} [watchFiles]
 */

/**
 * @typedef {object} WrapperImport
 * @property {string} specifier
 * @property {'module' | 'runtime'} kind
 * @property {{ url: string, format?: string }} target
 * @property {boolean} external
 */

/**
 * @typedef {object} LoadResult
 * @property {string | ArrayBuffer | ArrayBufferView} [source]
 * @property {string} [format]
 * @property {Iterable<string>} [watchFiles]
 */

/**
 * Creates an ESM wrapper without embedding bundler-specific module identifiers.
 *
 * @param {object} options
 * @param {BundlerModule} options.module
 * @param {(specifier: string, context: ModuleContext) =>
 *   (ResolveResult | Promise<ResolveResult>)} options.resolve
 * @param {(url: string, context: ModuleContext) => (LoadResult | Promise<LoadResult>)} options.load
 * @returns {Promise<{
 *   code: string,
 *   imports: WrapperImport[],
 *   watchFiles: string[],
 *   sideEffects: true
 * }>}
 */
export async function createWrapperModule ({ module: moduleData, resolve, load }) {
  const context = { format: moduleData.format, cache: false }
  const watchFiles = new Set()
  const formats = new Map([[moduleData.url, moduleData.format]])

  if (moduleData.url.startsWith('file:')) {
    watchFiles.add(moduleData.url)
  }

  /**
   * @param {string} url
   * @param {ModuleContext} loadContext
   * @returns {Promise<LoadResult>}
   */
  const loadModule = async (url, loadContext) => {
    if (url === moduleData.url && moduleData.source !== undefined) {
      return {
        source: moduleData.source,
        format: moduleData.format
      }
    }

    const result = await load(url, loadContext)
    if (result.format !== undefined) {
      formats.set(url, result.format)
    }
    if (url.startsWith('file:')) {
      watchFiles.add(url)
    }
    if (result.watchFiles !== undefined) {
      for (const watchFile of result.watchFiles) {
        watchFiles.add(watchFile)
      }
    }
    return result
  }

  /**
   * @param {string} specifier
   * @param {ModuleContext} resolveContext
   * @returns {Promise<ResolveResult>}
   */
  const resolveModule = async (specifier, resolveContext) => {
    const result = await resolve(specifier, resolveContext)
    if (result.format !== undefined) {
      formats.set(result.url, result.format)
    }
    if (result.watchFiles !== undefined) {
      for (const watchFile of result.watchFiles) {
        watchFiles.add(watchFile)
      }
    }
    return result
  }

  if (moduleData.format === 'commonjs' || moduleData.format === 'commonjs-typescript') {
    let source = moduleData.source
    if (source === undefined) {
      const result = await loadModule(moduleData.url, context)
      source = result.source
    }
    if (source === undefined) {
      throw new TypeError(`The bundler load adapter returned no source for '${moduleData.url}'`)
    }

    return {
      code: buildCommonJSWrapperSource({
        realUrl: moduleData.url,
        source,
        originalSpecifier: moduleData.specifier,
        data: moduleData.data,
        runtimeSpecifier: RUNTIME_SPECIFIER,
        preserveOuterBindings: true
      }),
      imports: [{
        specifier: RUNTIME_SPECIFIER,
        kind: 'runtime',
        target: {
          url: runtimeUrl,
          format: 'commonjs'
        },
        external: false
      }],
      watchFiles: Array.from(watchFiles),
      sideEffects: true
    }
  }

  const io = { resolve: resolveModule, load: loadModule }
  const selectPassthroughExports = typeof moduleData.passthroughExports === 'function'
    ? moduleData.passthroughExports
    : undefined
  const moduleExportsCache = selectPassthroughExports === undefined ? undefined : new Map()
  const { bindings } = await driveAsync(processModule({
    srcUrl: moduleData.url,
    context,
    moduleExportsCache
  }), io)
  let selectedPassthroughExports = moduleData.passthroughExports
  if (selectPassthroughExports !== undefined) {
    const exportNames = Array.isArray(bindings) ? bindings.slice() : Array.from(bindings.keys())
    const exports = await driveAsync(resolveExportBindings({
      srcUrl: moduleData.url,
      context,
      exportNames,
      moduleExportsCache
    }), io)
    selectedPassthroughExports = selectPassthroughExports(exports)
  }
  const passthroughExports = selectedPassthroughExports === undefined
    ? undefined
    : new Set(selectedPassthroughExports)

  /** @type {WrapperImport[]} */
  const imports = [{
    specifier: RUNTIME_SPECIFIER,
    kind: 'runtime',
    target: {
      url: runtimeUrl,
      format: 'commonjs'
    },
    external: false
  }]
  const moduleSpecifiers = new Map()

  /**
   * @param {string} url
   * @returns {string}
   */
  const mapImport = (url) => {
    let specifier = moduleSpecifiers.get(url)
    if (specifier === undefined) {
      specifier = `${MODULE_SPECIFIER_PREFIX}${moduleSpecifiers.size}__.js`
      moduleSpecifiers.set(url, specifier)
      imports.push({
        specifier,
        kind: 'module',
        target: {
          url,
          format: formats.get(url)
        },
        external: url.startsWith('node:') || builtinModules.includes(url)
      })
    }
    return specifier
  }

  const code = buildWrapperSourceWithData({
    realUrl: moduleData.url,
    bindings,
    originalSpecifier: moduleData.specifier,
    data: moduleData.data,
    runtimeSpecifier: RUNTIME_SPECIFIER,
    mapImport,
    passthroughExports
  })

  return {
    code,
    imports,
    watchFiles: Array.from(watchFiles),
    sideEffects: true
  }
}
