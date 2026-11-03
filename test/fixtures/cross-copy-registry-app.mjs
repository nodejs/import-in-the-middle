import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { EventEmitter, getMaxListeners } from 'node:events'
import { createRequire } from 'node:module'

import { foo as cjsFoo } from 'some-external-cjs-module'
import { foo as esmFoo } from 'some-external-module'

import {
  cjsAfter, expectedConsumers, hits, hooks, installHooks, legacyPath, ReplayHook, scenario
} from './cross-copy-registry-preload.mjs'

const require = createRequire(import.meta.url)
if (scenario.late) installHooks()

/**
 * @param {string} value The original export.
 * @param {string} name The module name.
 * @param {boolean} [removed] Whether the first hook was removed.
 */
function expected (value, name, removed = false) {
  for (const consumer of expectedConsumers(name, removed)) {
    value += `:${consumer}`
  }
  return value
}

/**
 * @param {string} name The module name.
 * @param {string | undefined} format The loader format.
 * @param {boolean} [removed] Whether the first hook was removed.
 */
function assertHits (name, format, removed = false) {
  const expectedHits = []
  for (const consumer of expectedConsumers(name, removed)) {
    expectedHits.push({ consumer, name, format })
  }
  const actualHits = hits.filter(
    /** @param {import('./cross-copy-registry-preload.mjs').HookHit} hit */ hit => hit.name === name
  )
  deepStrictEqual(actualHits, expectedHits)
}

strictEqual(esmFoo, expected('bar', 'some-external-module'))
strictEqual(cjsFoo, expected('bar', 'some-external-cjs-module'))
const emitter = new EventEmitter()
strictEqual(String(getMaxListeners(emitter)), expected('10', 'events'))
strictEqual(require('node:events').getMaxListeners(emitter), 10)
assertHits('some-external-module', 'module')
assertHits('some-external-cjs-module', 'commonjs')
assertHits('events', 'builtin')
strictEqual(hits.length, expectedConsumers('some-external-module').length +
  expectedConsumers('some-external-cjs-module').length + expectedConsumers('events').length, JSON.stringify(hits))

hooks[0].unhook()
const [esmSub, cjsSub, querystring, legacy] = await Promise.all([
  import('some-external-module/sub'),
  import(cjsAfter),
  import('node:querystring'),
  import('./cross-copy-registry-legacy.mjs')
])
strictEqual(esmSub.bar, expected('baz', 'some-external-module/sub', true))
strictEqual(cjsSub.foo, expected('bar', cjsAfter, true))
strictEqual(querystring.escape('a b'), expected('a%20b', 'querystring', true))
strictEqual(require('node:querystring').escape('a b'), 'a%20b')
strictEqual(legacy.foo, expected('legacy', legacyPath, true))
assertHits('some-external-module/sub', 'module', true)
assertHits(cjsAfter, 'commonjs', true)
assertHits('querystring', 'builtin', true)
assertHits(legacyPath, undefined, true)
hooks[1].unhook()

const replayHits = []
/**
 * @param {{ foo: string }} namespace The legacy wrapper exports.
 * @param {string} name The module name.
 * @param {string | undefined} baseDir The package directory.
 * @param {string | undefined} format The loader format.
 */
function onReplay (namespace, name, baseDir, format) {
  replayHits.push(name)
  strictEqual(baseDir, undefined)
  strictEqual(format, undefined)
  namespace.foo += ':replay'
}
const replayHook = new ReplayHook([legacyPath], onReplay)
deepStrictEqual(replayHits, [legacyPath])
strictEqual(legacy.foo, expected('legacy', legacyPath, true) + ':replay')
replayHook.unhook()
