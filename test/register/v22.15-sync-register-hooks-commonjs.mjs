import { deepStrictEqual, match, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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
strictEqual(resolveAsRequire('file:///unknown.wasm').url, 'file:///unknown.wasm')

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
  strictEqual(resolveAsRequire(invalidPackageUrl).url, invalidPackageUrl)
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
    source: Buffer.from('const value: number = 43; module.exports = value')
  }))
  match(typeScript.source, /module\.exports = value/)

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
  match(chainLoad.source, /\nregister\(/)
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
register({
  commonjs: true,
  include: [commonJsUrl.href, commonJsTypeScriptUrl.href, esmUrl.href, 'fs', 'node:test']
})

const require = createRequire(import.meta.url)
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
const esmHook = new Hook([esmFilename], exports => {
  exports.foo = 43
})
strictEqual(require(esmFilename).foo, 43)
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
