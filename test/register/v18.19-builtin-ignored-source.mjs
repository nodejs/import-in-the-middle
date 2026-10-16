import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'

import Hook from '../../index.js'

register(new URL('../fixtures/builtin-source-loader.mjs', import.meta.url))
register(new URL('../../hook.mjs', import.meta.url), { data: { include: ['fs', 'events'] } })

let calls = 0
/**
 * @param {Record<string, unknown>} exports
 * @param {string} name
 */
const hook = new Hook(['fs', 'events'], (exports, name) => {
  strictEqual(typeof exports[name === 'fs' ? 'readFile' : 'once'], 'function')
  strictEqual(Object.hasOwn(exports, 'fake'), false)
  calls++
})

const [fs, events] = await Promise.all([import('fs'), import('events')])
strictEqual(typeof fs.readFile, 'function')
strictEqual(typeof events.once, 'function')
strictEqual(Object.hasOwn(events, 'fake'), false)
strictEqual(calls, 2)
hook.unhook()
