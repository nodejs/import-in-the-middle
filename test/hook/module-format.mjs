import assert from 'node:assert/strict'

import Hook, { addHook, removeHook } from '../../index.js'

const targets = new Map([
  [new URL('../fixtures/something.js', import.meta.url).href, 'commonjs'],
  [new URL('../fixtures/something.mjs', import.meta.url).href, 'module'],
  ['node:fs', 'builtin']
])
const early = new Map()
const late = new Map()

/**
 * @param {string} url
 * @param {object} exported
 * @param {string} specifier
 * @param {string | undefined} format
 */
function observe (url, exported, specifier, format) {
  if (targets.has(url)) early.set(url, format)
}

addHook(observe)
const highLevel = new Map()
const hook = new Hook((exported, name, baseDir, format) => {
  if (name.endsWith('/something.js') || name.endsWith('/something.mjs') || name === 'fs') {
    highLevel.set(name, format)
  }
})

const cjs = await import('../fixtures/something.js')
const esm = await import('../fixtures/something.mjs')
const builtin = await import('node:fs')
assert.equal(cjs.default(), 42)
assert.equal(esm.default(), 42)
assert.equal(typeof builtin.readFile, 'function')
assert.deepEqual(early, targets)
assert.deepEqual([...highLevel.values()], ['commonjs', 'module', 'builtin'])
hook.unhook()
removeHook(observe)

const replayHook = new Hook((exported, name, baseDir, format) => {
  if (highLevel.has(name)) late.set(name, format)
})
assert.deepEqual(late, highLevel)
replayHook.unhook()

const replay = new Map()
/**
 * @param {string} url
 * @param {object} exported
 * @param {string} specifier
 * @param {string | undefined} format
 */
function observeReplay (url, exported, specifier, format) {
  if (targets.has(url)) replay.set(url, format)
}
addHook(observeReplay)
assert.deepEqual(replay, targets)
removeHook(observeReplay)
