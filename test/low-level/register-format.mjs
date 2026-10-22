import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { addHook, removeHook } from '../../index.js'

const require = createRequire(import.meta.url)
const { register, ModuleBinder } = require('../../lib/register.js')
const observed = []
/**
 * @param {string} url
 * @param {object} exported
 * @param {string} specifier
 * @param {string | undefined} format
 */
function observe (url, exported, specifier, format) {
  if (url.startsWith('file:///format-')) observed.push([url, exported.value, specifier, format])
}
addHook(observe)
register('file:///format-current', new ModuleBinder({ value: 42 }, ['value'], () => {}), 'current', 'commonjs')
register('file:///format-previous', new ModuleBinder({ value: 43 }, ['value'], () => {}), 'previous')
register('file:///format-legacy', {}, {}, { value: () => 44 }, 'legacy')
const expected = [
  ['file:///format-current', 42, 'current', 'commonjs'],
  ['file:///format-previous', 43, 'previous', undefined],
  ['file:///format-legacy', 44, 'legacy', undefined]
]
assert.deepEqual(observed, expected)
removeHook(observe)
observed.length = 0
addHook(observe)
assert.deepEqual(observed, expected)
removeHook(observe)
