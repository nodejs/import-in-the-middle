import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { register } from 'node:module'

import Hook, { addHook, createAddHookMessageChannel, removeHook } from '../../index.js'

const firstUrl = new URL('../fixtures/export-capability-named.mjs', import.meta.url)
const nextUrl = new URL('../fixtures/export-capability-isolated.mjs', import.meta.url)
const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
register('../../hook.mjs', import.meta.url, registerOptions)
let trackedCalls = 0
const tracked = new Hook(() => { trackedCalls++ })
await waitForAllMessagesAcknowledged()
await import(firstUrl)

const order = []
let action
function duplicate () {
  if (action !== undefined) {
    const nested = action === 'nested'
    action = undefined
    if (nested) addHook(duplicate)
    throw new Error('replay failed')
  }
  order.push('first')
}
function observer () { order.push('second') }
addHook(duplicate)
addHook(observer)

for (const [mode, expected] of [
  ['throw', ['first', 'second']],
  ['nested', ['first', 'second', 'first']]
]) {
  action = mode
  throws(() => addHook(duplicate), { message: 'replay failed' })
  await waitForAllMessagesAcknowledged()
  order.length = 0
  await import(mode === 'throw' ? nextUrl : new URL('../fixtures/export-capability-default.mjs', import.meta.url))
  deepStrictEqual(order, expected)
}
removeHook(duplicate)
removeHook(duplicate)
removeHook(observer)

let selfRemovingCalls = 0
function selfRemoving () {
  selfRemovingCalls++
  removeHook(selfRemoving)
  throw new Error('self-removing replay failed')
}
throws(() => addHook(selfRemoving), { message: 'self-removing replay failed' })
await waitForAllMessagesAcknowledged()
trackedCalls = 0
await import('../fixtures/export-capability-legacy.mjs')
strictEqual(selfRemovingCalls, 1)
strictEqual(trackedCalls, 1)
tracked.unhook()
await waitForAllMessagesAcknowledged()
