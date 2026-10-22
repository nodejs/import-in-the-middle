import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import Hook from '../../index.js'

const expected = new Map([
  [fileURLToPath(new URL('../fixtures/node_modules/some-external-cjs-module/star.mjs', import.meta.url)), 'module'],
  [fileURLToPath(new URL('../fixtures/node_modules/some-external-cjs-module/sub.js', import.meta.url)), 'module']
])
const observed = new Map()
const hook = new Hook([...expected.keys()], (exported, name, baseDir, format) => {
  observed.set(name, format)
})
const namespace = await import('../fixtures/node_modules/some-external-cjs-module/star.mjs')
assert.deepEqual(observed, expected)
assert.equal(namespace.bar, 'baz')
hook.unhook()

const replay = new Map()
const late = new Hook([...expected.keys()], (exported, name, baseDir, format) => {
  replay.set(name, format)
})
assert.deepEqual(replay, expected)
late.unhook()
