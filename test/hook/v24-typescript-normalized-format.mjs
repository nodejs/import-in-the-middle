import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { register } from 'node:module'

import Hook from '../../index.js'

register('../loaders/typescript-normalized-format-loader.mjs', import.meta.url)

let esmExports

/**
 * @param {Record<string, unknown>} exports
 * @param {string} name
 */
const hook = new Hook((exports, name) => {
  if (name.endsWith('typescript-abstract-hook.mts')) {
    esmExports = Object.keys(exports)
  }
})

const [esm] = await Promise.all([
  import('../fixtures/typescript-abstract-hook.mts'),
  import('../fixtures/something.mjs')
])

strictEqual(typeof esm.AbstractDelta, 'function')
ok(esmExports)
deepStrictEqual(esmExports.slice().sort(), ['AbstractDelta', 'Delta'])

hook.unhook()
