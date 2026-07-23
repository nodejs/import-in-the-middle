import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { registerHooks } from 'node:module'

import {
  loadSync,
  resolveSync
} from '../loaders/typescript-normalized-format-loader.mjs'
import Hook from '../../index.js'
import { register } from '../../register-hooks.mjs'

register()
registerHooks({ load: loadSync, resolve: resolveSync })

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

const esm = await import('./typescript-abstract-hook.mts')

strictEqual(typeof esm.AbstractDelta, 'function')
ok(esmExports)
deepStrictEqual(esmExports.slice().sort(), ['AbstractDelta', 'Delta'])

hook.unhook()
