import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import Hook from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const commonJsUrl = new URL('../fixtures/sync-commonjs-semantics.cjs', import.meta.url)
const cycleAUrl = new URL('../fixtures/sync-commonjs-cycle-a.cjs', import.meta.url)
const cycleBUrl = new URL('../fixtures/sync-commonjs-cycle-b.cjs', import.meta.url)
const commonJsTypeScriptUrl = new URL('../fixtures/sync-commonjs-typescript.cts', import.meta.url)
const importedCommonJsUrl = new URL('../fixtures/something.js', import.meta.url)
const requiredEsmUrl = new URL('../fixtures/something.mjs', import.meta.url)
const requiredPackageEsmUrl = new URL('../fixtures/type-module/module.js', import.meta.url)
const includedUrls = new Set([
  commonJsUrl.href,
  cycleAUrl.href,
  cycleBUrl.href,
  commonJsTypeScriptUrl.href,
  importedCommonJsUrl.href,
  requiredEsmUrl.href,
  requiredPackageEsmUrl.href,
  'node:fs'
])

register({
  commonjs: true,
  shouldInclude (url) {
    if (!includedUrls.has(url)) return false
    return { data: { filename: url.startsWith('file:') ? basename(fileURLToPath(url)) : url } }
  }
})

const require = nodeModule.createRequire(import.meta.url)
const commonJsFilename = fileURLToPath(commonJsUrl)
let commonJsHookCount = 0

const commonJsHook = new Hook([commonJsFilename], (exports, name, baseDir, data) => {
  commonJsHookCount++
  strictEqual(name, commonJsFilename)
  strictEqual(baseDir, undefined)
  deepStrictEqual(data, { filename: 'sync-commonjs-semantics.cjs' })
  return { ...exports, hooked: true }
})

const first = require(commonJsFilename)
strictEqual(first.value, 42)
strictEqual(first.hooked, true)
strictEqual(first.unreachable, undefined)
strictEqual(first.topLevelThis, first.argumentExports)
strictEqual(require(commonJsFilename), first)
strictEqual(commonJsHookCount, 1)

const lateHook = new Hook([commonJsFilename], exports => ({ ...exports, late: true }))
const late = require(commonJsFilename)
strictEqual(late.late, true)
strictEqual(late.value, 42)
lateHook.unhook()
commonJsHook.unhook()

const cycleCounts = new Map()
const cycleHook = new Hook([
  fileURLToPath(cycleAUrl),
  fileURLToPath(cycleBUrl)
], (exports, name) => {
  cycleCounts.set(name, (cycleCounts.get(name) ?? 0) + 1)
  return exports
})
const cycle = require(fileURLToPath(cycleAUrl))
deepStrictEqual(cycle, { name: 'a', fromB: 'b', seenByB: 'a' })
strictEqual(cycleCounts.get(fileURLToPath(cycleAUrl)), 1)
strictEqual(cycleCounts.get(fileURLToPath(cycleBUrl)), 1)
cycleHook.unhook()

const commonJsTypeScriptHook = new Hook([fileURLToPath(commonJsTypeScriptUrl)], exports => {
  exports.value++
})
const commonJsTypeScript = require(fileURLToPath(commonJsTypeScriptUrl))
strictEqual(commonJsTypeScript.value, 43)
commonJsTypeScriptHook.unhook()

const importedHook = new Hook([fileURLToPath(importedCommonJsUrl)], exports => {
  exports.foo = 43
})
const imported = await import(importedCommonJsUrl)
strictEqual(imported.foo, 43)
strictEqual(imported.default.foo, 43)
importedHook.unhook()

const esmHook = new Hook([fileURLToPath(requiredEsmUrl)], (exports, name, baseDir, data) => {
  deepStrictEqual(data, { filename: 'something.mjs' })
  exports.foo = 57
})
const requiredEsm = require(fileURLToPath(requiredEsmUrl))
strictEqual(requiredEsm.foo, 57)
esmHook.unhook()

const packageEsmHook = new Hook([fileURLToPath(requiredPackageEsmUrl)], exports => {
  exports.value = 57
})
const requiredPackageEsm = require(fileURLToPath(requiredPackageEsmUrl))
strictEqual(requiredPackageEsm.value, 57)
packageEsmHook.unhook()

const fsHook = new Hook(['fs'], (exports, name, baseDir, data) => {
  strictEqual(name, 'fs')
  strictEqual(baseDir, undefined)
  deepStrictEqual(data, { filename: 'node:fs' })
  exports[Symbol.for('iitm.sync-commonjs')] = true
  return exports
})
const fs = require('fs')
strictEqual(fs, require('node:fs'))
strictEqual(fs[Symbol.for('iitm.sync-commonjs')], true)
ok(Object.isExtensible(fs))
fsHook.unhook()

const temporaryDirectory = await realpath(await mkdtemp(join(tmpdir(), 'iitm-commonjs-')))
try {
  const packageLessFilename = join(temporaryDirectory, 'package-less.js')
  const packageLessUrl = pathToFileURL(packageLessFilename)
  await writeFile(packageLessFilename, 'module.exports = { value: 42 }\n')
  includedUrls.add(packageLessUrl.href)

  const packageLessHook = new Hook([packageLessFilename], exports => {
    exports.value++
  })
  strictEqual(require(packageLessFilename).value, 43)
  packageLessHook.unhook()
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
