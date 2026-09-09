import { deepStrictEqual, match, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import Hook from '../../index.js'
import { createHook } from '../../create-hook.mjs'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const hookMeta = { url: new URL('../../register-hooks.mjs', import.meta.url).href }
const lowLevelHook = createHook(hookMeta, true)
const requireContext = { conditions: ['require'], parentURL: import.meta.url }

/**
 * @param {string} url
 * @param {string} [format]
 * @param {object} [context]
 * @returns {object}
 */
function resolveAsRequire (url, format, context = requireContext) {
  return lowLevelHook.resolveSyncCommonJS(url, context, () => ({ url, format }))
}

deepStrictEqual(resolveAsRequire('file:///entry', undefined, { conditions: ['require'] }), {
  url: 'file:///entry',
  format: 'commonjs'
})
deepStrictEqual(resolveAsRequire('file:///entry.cjs', undefined, { conditions: ['require'] }), {
  url: 'file:///entry.cjs',
  format: undefined
})

const ignored = { url: 'file:///ignored.json', format: 'json' }
strictEqual(lowLevelHook.resolveSyncCommonJS('ignored', requireContext, () => ignored), ignored)
strictEqual(resolveAsRequire('file:///native.node').url, 'file:///native.node')
strictEqual(resolveAsRequire('file:///data.json', undefined, {
  ...requireContext,
  importAttributes: { type: 'json' }
}).url, 'file:///data.json')
strictEqual(resolveAsRequire(import.meta.url, 'module', {
  conditions: ['require'],
  parentURL: import.meta.url
}).shortCircuit, true)
strictEqual(resolveAsRequire('https://example.com/module').url, 'https://example.com/module')
const unknownWasmUrl = 'file:///unknown.wasm'
strictEqual(resolveAsRequire(unknownWasmUrl).url, unknownWasmUrl)

const filteredHook = createHook(hookMeta, true)
filteredHook.applyOptions({ include: ['included'] })
const filtered = { url: 'file:///filtered.cjs', format: 'commonjs' }
strictEqual(filteredHook.resolveSyncCommonJS('filtered', requireContext, () => filtered), filtered)
strictEqual(lowLevelHook.resolveSyncCommonJS('nested', {
  conditions: ['require'],
  parentURL: hookMeta.url
}, () => filtered), filtered)

const formatDirectory = mkdtempSync(join(tmpdir(), 'iitm-formats-'))
try {
  writeFileSync(join(formatDirectory, 'package.json'), '{"type":"module"}')
  const moduleUrl = pathToFileURL(join(formatDirectory, 'module.js')).href
  const moduleTypeScriptUrl = pathToFileURL(join(formatDirectory, 'module.ts')).href
  strictEqual(resolveAsRequire(moduleUrl).format, 'module')
  strictEqual(resolveAsRequire(moduleTypeScriptUrl).format, 'module-typescript')
  strictEqual(resolveAsRequire(pathToFileURL(join(formatDirectory, 'module.mts')).href).format, 'module-typescript')

  const invalidDirectory = join(formatDirectory, 'invalid')
  const invalidPackageUrl = pathToFileURL(join(invalidDirectory, 'module.js')).href
  const invalidPackageDirectory = fileURLToPath(new URL('.', invalidPackageUrl))
  process.getBuiltinModule('fs').mkdirSync(invalidPackageDirectory)
  writeFileSync(join(invalidPackageDirectory, 'package.json'), '{')
  strictEqual(resolveAsRequire(invalidPackageUrl).url, `${invalidPackageUrl}?iitm=true`)
} finally {
  rmSync(formatDirectory, { recursive: true, force: true })
}

strictEqual(resolveAsRequire('file:///iitm-default/module.ts').url, 'file:///iitm-default/module.ts')
strictEqual(resolveAsRequire('file:///iitm-default/module.js').url, 'file:///iitm-default/module.js')

const fallbackDirectory = mkdtempSync(join(tmpdir(), 'iitm-commonjs-source-'))
const fallbackFilename = join(fallbackDirectory, 'module.cjs')
const fallbackUrl = pathToFileURL(fallbackFilename).href
try {
  writeFileSync(fallbackFilename, 'module.exports = 42')
  resolveAsRequire(fallbackUrl)
  const fallback = lowLevelHook.loadSyncCommonJS(fallbackUrl, {}, () => ({
    format: 'commonjs',
    source: undefined
  }))
  match(fallback.source, /module\.exports = 42/)

  const typeScriptUrl = pathToFileURL(join(fallbackDirectory, 'module.cts')).href
  resolveAsRequire(typeScriptUrl, 'commonjs-typescript')
  const typeScript = lowLevelHook.loadSyncCommonJS(typeScriptUrl, {}, () => ({
    format: 'commonjs-typescript',
    source: new TextEncoder().encode('const value: number = 43; module.exports = value')
  }))
  match(typeScript.source, /module\.exports = value/)

  const loadTimeModuleUrl = 'data:text/javascript,export%20const%20value%20%3D%2042'
  const loadTimeResolution = resolveAsRequire(loadTimeModuleUrl)
  let loadedUrl
  const loadTimeModule = lowLevelHook.loadSyncCommonJS(loadTimeResolution.url, {}, url => {
    loadedUrl = url
    return {
      format: 'module',
      source: 'export const value = 42'
    }
  })
  strictEqual(loadedUrl, loadTimeModuleUrl)
  strictEqual(loadTimeModule.format, 'module')
  match(loadTimeModule.source, /export \{ \$0 as value \}/)
  match(loadTimeModule.source, /\nregisterWithData\(/)

  const skippedUrl = pathToFileURL(join(fallbackDirectory, 'skipped.cjs')).href
  resolveAsRequire(skippedUrl, 'builtin')
  const skipped = { format: 'builtin', source: 'module.exports = 44' }
  strictEqual(lowLevelHook.loadSyncCommonJS(skippedUrl, {}, () => skipped), skipped)

  const chainHook = createHook(hookMeta, true)
  const chainResolution = chainHook.resolveSyncCommonJS(fallbackUrl, {
    conditions: ['import'],
    parentURL: import.meta.url
  }, () => ({ url: fallbackUrl, format: 'commonjs' }))
  const chainLoad = chainHook.loadSyncCommonJS(chainResolution.url, { format: 'commonjs' }, () => ({
    format: 'commonjs',
    source: 'module.exports = 45'
  }))
  match(chainLoad.source, /\nregisterWithData\(/)
  const child = { url: pathToFileURL(join(fallbackDirectory, 'child.cjs')).href, format: 'commonjs' }
  strictEqual(chainHook.resolveSyncCommonJS('child', {
    conditions: ['require'],
    parentURL: fallbackUrl
  }, () => child), child)

  const invalidSourceUrl = pathToFileURL(join(fallbackDirectory, 'invalid-source.cjs')).href
  resolveAsRequire(invalidSourceUrl, 'commonjs')
  const invalidSource = { format: 'commonjs', source: {} }
  const emitWarning = process.emitWarning
  let warning
  process.emitWarning = value => { warning = value }
  try {
    strictEqual(lowLevelHook.loadSyncCommonJS(invalidSourceUrl, {}, () => invalidSource), invalidSource)
  } finally {
    process.emitWarning = emitWarning
  }
  strictEqual(warning.cause instanceof TypeError, true)

  const failedUrl = pathToFileURL(join(fallbackDirectory, 'failed.cjs')).href
  resolveAsRequire(failedUrl, 'commonjs')
  throws(() => lowLevelHook.loadSyncCommonJS(failedUrl, {}, () => {
    throw new Error('load failed')
  }), /load failed/)
  deepStrictEqual(lowLevelHook.loadSyncCommonJS(failedUrl, {}, () => ({ source: undefined })), {
    source: undefined
  })
} finally {
  rmSync(fallbackDirectory, { recursive: true, force: true })
}

const commonJsUrl = new URL('../fixtures/something.js', import.meta.url)
const commonJsTypeScriptUrl = new URL('../fixtures/typescript-cjs-hook.cts', import.meta.url)
const esmUrl = new URL('../fixtures/something.mjs', import.meta.url)
const loadTimeSpecifier = 'iitm-load-time-module'
const loadTimeModuleUrl = 'data:text/javascript,export%20const%20value%20%3D%2042'
const applicationJavaScriptUrl = 'data:application/javascript,export%20const%20value%20%3D%2042'
const nativeFormatDirectory = mkdtempSync(join(tmpdir(), 'iitm-native-formats-'))
const loadTimeJsonFilename = join(nativeFormatDirectory, 'load-time.json')
const loadTimeJsonUrl = pathToFileURL(loadTimeJsonFilename).href
const loadTimeWasmSpecifier = 'iitm-load-time-wasm'
const loadTimeWasmFilename = join(nativeFormatDirectory, 'load-time.wasm')
const loadTimeWasmUrl = pathToFileURL(loadTimeWasmFilename).href
writeFileSync(loadTimeJsonFilename, '{"value":42}')
writeFileSync(loadTimeWasmFilename, new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x0a, 0x01, 0x06, 0x61, 0x6e, 0x73, 0x77, 0x65, 0x72, 0x00, 0x00,
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b
]))

/**
 * @param {string} specifier
 * @param {object} context
 * @param {Function} nextResolve
 * @returns {object}
 */
function resolveLoadTimeModule (specifier, context, nextResolve) {
  if (specifier === loadTimeSpecifier || specifier === loadTimeModuleUrl) {
    return { url: loadTimeModuleUrl, shortCircuit: true }
  }
  if (specifier === loadTimeWasmSpecifier) {
    return { url: loadTimeWasmUrl, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

/**
 * @param {string} url
 * @param {object} context
 * @param {Function} nextLoad
 * @returns {object}
 */
function loadLoadTimeModule (url, context, nextLoad) {
  if (url === loadTimeModuleUrl) {
    return {
      format: 'module',
      source: 'export const value = 42',
      shortCircuit: true
    }
  }
  return nextLoad(url, context)
}

nodeModule.registerHooks({ resolve: resolveLoadTimeModule, load: loadLoadTimeModule })
register({
  commonjs: true,
  include: [
    commonJsUrl.href,
    commonJsTypeScriptUrl.href,
    esmUrl.href,
    loadTimeSpecifier,
    /^data:application\/javascript,/,
    loadTimeJsonUrl,
    loadTimeWasmSpecifier,
    'fs',
    'node:test'
  ]
})

const require = nodeModule.createRequire(import.meta.url)
try {
  deepStrictEqual(require(loadTimeJsonFilename), { value: 42 })
  const wasmNamespace = await import(loadTimeWasmSpecifier)
  strictEqual(wasmNamespace.answer(), 42)
} finally {
  rmSync(nativeFormatDirectory, { recursive: true, force: true })
}
let applicationJavaScriptHookCalls = 0
/** @param {object} exports The wrapped ESM namespace. */
function patchApplicationJavaScript (exports) {
  applicationJavaScriptHookCalls++
  exports.value = 43
}
const applicationJavaScriptHook = new Hook([applicationJavaScriptUrl], patchApplicationJavaScript)
try {
  const namespace = await import(applicationJavaScriptUrl)
  strictEqual(namespace.value, 43)
  strictEqual(applicationJavaScriptHookCalls, 1)
} finally {
  applicationJavaScriptHook.unhook()
}
let loadTimeHookCalls = 0
/** @param {object} exports The wrapped ESM namespace. */
function patchLoadTimeModule (exports) {
  loadTimeHookCalls++
  exports.value = 43
}
const loadTimeHook = new Hook([loadTimeSpecifier], patchLoadTimeModule)
try {
  const namespace = require(loadTimeSpecifier)
  strictEqual(namespace.value, 43)
  strictEqual(loadTimeHookCalls, 1)
} finally {
  loadTimeHook.unhook()
}

const commonJsFilename = fileURLToPath(commonJsUrl)
const commonJsHook = new Hook([commonJsFilename], exports => ({
  value: exports(),
  foo: exports.foo
}))

const first = require(commonJsFilename)
deepStrictEqual(first, { value: 42, foo: 42 })
strictEqual(require(commonJsFilename), first)

const lateHook = new Hook([commonJsFilename], exports => ({ ...exports, late: true }))
strictEqual(require(commonJsFilename).late, true)
lateHook.unhook()
commonJsHook.unhook()

const commonJsTypeScriptFilename = fileURLToPath(commonJsTypeScriptUrl)
const commonJsTypeScriptHook = new Hook([commonJsTypeScriptFilename], exports => {
  exports.epsilon++
})
strictEqual(require(commonJsTypeScriptFilename).epsilon, 6)
commonJsTypeScriptHook.unhook()

const esmFilename = fileURLToPath(esmUrl)
let esmFormat
/**
 * @param {object} exports The wrapped ESM namespace.
 * @param {string} name The module name.
 * @param {string|undefined} baseDir The package directory.
 * @param {unknown} data Consumer data associated with the module.
 * @param {'module'|'commonjs'|undefined} format The module format.
 */
function patchEsm (exports, name, baseDir, data, format) {
  exports.foo = 43
  esmFormat = format
}
const esmHook = new Hook([esmFilename], patchEsm)
strictEqual(require(esmFilename).foo, 43)
strictEqual(esmFormat, 'module')
esmHook.unhook()

const marker = Symbol('iitm-commonjs')
const fsHook = new Hook(['fs'], exports => {
  exports[marker] = true
})
const fs = require('fs')
strictEqual(fs, require('node:fs'))
strictEqual(fs[marker], true)
delete fs[marker]
fsHook.unhook()

const nodeTestHook = new Hook(['node:test'], exports => {
  exports[marker] = true
})
const nodeTest = require('node:test')
strictEqual(nodeTest, process.getBuiltinModule('node:test'))
strictEqual(nodeTest[marker], true)
delete nodeTest[marker]
nodeTestHook.unhook()
