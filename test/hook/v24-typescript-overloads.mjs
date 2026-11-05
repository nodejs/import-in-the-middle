import { strictEqual } from 'node:assert/strict'
import Hook from '../../index.js'

let hooked = false

/**
 * @param {Record<string, unknown>} exports
 * @param {string} name
 */
const hook = new Hook((exports, name) => {
  if (name.endsWith('typescript-overloads.mts')) {
    hooked = true
    exports.other = 2
  }
})

const mod = await import('../fixtures/typescript-overloads-barrel.mjs')

strictEqual(hooked, true)
strictEqual(mod.any('a'), 'a')
strictEqual(mod.any(1), 1)
strictEqual(mod.other, 2)
strictEqual(Object.keys(mod).length, 2)

hook.unhook()
