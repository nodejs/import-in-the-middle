// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

'use strict'

import { driveAsync } from './lib/io.mjs'
import {
  buildCommonJSWrapperSource,
  buildWrapperSource,
  processModule
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
 * @property {unknown} [target]
 * @property {unknown} [data]
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
 * @property {unknown} [target]
 * @property {Iterable<string>} [watchFiles]
 */

/**
 * @typedef {object} WrapperImport
 * @property {string} specifier
 * @property {'module' | 'runtime'} kind
 * @property {string} url
 * @property {string} [format]
 * @property {unknown} target
 */

/**
 * @typedef {object} LoadResult
 * @property {string | ArrayBuffer | ArrayBufferView} [source]
 * @property {string} [format]
 * @property {Iterable<string>} [watchFiles]
 */

/**
 * Creates a format-aware wrapper without embedding bundler-specific module identifiers.
 *
 * @param {object} options
 * @param {BundlerModule} options.module
 * @param {(specifier: string, context: ModuleContext) =>
 *   (ResolveResult | Promise<ResolveResult>)} options.resolve
 * @param {(target: unknown, context: ModuleContext) => (LoadResult | Promise<LoadResult>)} options.load
 * @returns {Promise<{
 *   code: string,
 *   format: 'module' | 'commonjs',
 *   imports: WrapperImport[],
 *   watchFiles: string[],
 *   sideEffects: true
 * }>}
 */
export async function createWrapperModule ({ module: moduleData, resolve, load }) {
  const context = { format: moduleData.format, cache: false }
  const watchFiles = new Set()
  const formats = new Map([[moduleData.url, moduleData.format]])
  const targets = new Map([[
    moduleData.url,
    moduleData.target ?? { url: moduleData.url, format: moduleData.format }
  ]])

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

    const result = await load(targets.get(url), loadContext)
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
    targets.set(result.url, result.target ?? { url: result.url, format: result.format })
    return result
  }

  /** @type {WrapperImport[]} */
  const imports = [{
    specifier: RUNTIME_SPECIFIER,
    kind: 'runtime',
    url: runtimeUrl,
    format: 'commonjs',
    target: {
      url: runtimeUrl,
      format: 'commonjs'
    }
  }]

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
        runtimeSpecifier: RUNTIME_SPECIFIER
      }),
      format: 'commonjs',
      imports,
      watchFiles: Array.from(watchFiles),
      sideEffects: true
    }
  }

  if (moduleData.format !== 'module' && moduleData.format !== 'module-typescript' && moduleData.format !== 'builtin') {
    throw new TypeError(`Unsupported module format '${moduleData.format}'`)
  }

  const { bindings } = await driveAsync(
    processModule({ srcUrl: moduleData.url, context }),
    { resolve: resolveModule, load: loadModule }
  )

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
        url,
        format: formats.get(url),
        target: targets.get(url)
      })
    }
    return specifier
  }

  const code = buildWrapperSource({
    realUrl: moduleData.url,
    bindings,
    originalSpecifier: moduleData.specifier,
    data: moduleData.data,
    runtimeSpecifier: RUNTIME_SPECIFIER,
    mapImport
  })

  return {
    code,
    format: 'module',
    imports,
    watchFiles: Array.from(watchFiles),
    sideEffects: true
  }
}
