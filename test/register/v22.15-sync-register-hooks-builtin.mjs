// Regression test: under the synchronous `module.registerHooks` loader, iitm's
// own internal `require()` for a builtin used to be intercepted by iitm's
// in-thread hooks and resolve to the half-built wrapper, so a hooked builtin
// lost all of its named exports and was wrapped repeatedly. `getBuiltinModule`
// now reads the native module directly. The off-thread `module.register`
// loader was never affected because its `require` runs unhooked on the loader
// thread.

import * as nodeModule from 'node:module'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'
import Hook from '../../index.js'
import { ok, strictEqual, throws } from 'node:assert'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const nativeFs = await import('node:fs')
nativeFs.default.iitmReviewCustom = 1

register()

let eventsHookCount = 0
let fsHookCount = 0

// eslint-disable-next-line no-new
new Hook(['events', 'fs'], { replaceExports: [] }, (exports, name) => {
  if (name === 'events') eventsHookCount++
  if (name === 'fs') fsHookCount++
  throws(() => { exports.default = undefined }, { name: 'TypeError' })
})

const events = await import('node:events')

// The hook must fire exactly once: the re-entrancy bug wrapped node:events
// three times, so it fired three times.
strictEqual(eventsHookCount, 1, 'events hook should fire exactly once')

// Named exports must survive wrapping, not collapse to default/module.exports.
strictEqual(typeof events.default, 'function', 'default (EventEmitter) should be present')
strictEqual(typeof events.EventEmitter, 'function', 'EventEmitter named export should be present')
strictEqual(typeof events.once, 'function', 'once named export should be present')
strictEqual(typeof events.on, 'function', 'on named export should be present')
ok('kMaxEventTargetListeners' in events, 'non-enumerable own property should be present')

const fs = await import('node:fs')
strictEqual(fsHookCount, 1, 'fs hook should fire exactly once')
ok(!('iitmReviewCustom' in fs), 'late CommonJS properties should not become ESM exports')
strictEqual(fs.default.iitmReviewCustom, 1, 'default should retain late CommonJS properties')
strictEqual(typeof fs.readFileSync, 'function', 'readFileSync named export should be present')
strictEqual(typeof fs.existsSync, 'function', 'existsSync named export should be present')
strictEqual(typeof fs.default.readFileSync, 'function', 'default should carry the CJS exports')
delete nativeFs.default.iitmReviewCustom

// `module.registerHooks` also intercepts CommonJS `require()`. Unlike the ESM
// imports above, a `require()` must return the native, mutable builtin rather
// than the (non-extensible) ESM namespace the wrapper produces. npm's bundled
// graceful-fs does
// `Object.defineProperty(require('fs'), Symbol.for('graceful-fs.queue'), ...)`,
// which throws "object is not extensible" when require('fs') is wrapped.
const require = nodeModule.createRequire(import.meta.url)
const requiredFs = require('fs')
ok(Object.isExtensible(requiredFs), 'require("fs") must return an extensible object, not an ESM namespace')
Object.defineProperty(requiredFs, Symbol.for('graceful-fs.queue'), { value: [], configurable: true })
ok(Symbol.for('graceful-fs.queue') in requiredFs, 'defining a property on require("fs") must succeed')

// Bare and `node:`-prefixed require() resolve to the same native builtin.
for (const builtinName of ['crypto', 'http', 'events']) {
  strictEqual(
    require(builtinName),
    require(`node:${builtinName}`),
    `'${builtinName}' and 'node:${builtinName}' must resolve to the identical builtin`
  )
}

console.log('✅ module.registerHooks wrapped builtin imports and kept require() native')
