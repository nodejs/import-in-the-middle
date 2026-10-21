import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Hook, createAddHookMessageChannel } from '../../index.js'

register('../loaders/invalid-fileurl-module-loader.mjs', import.meta.url)
const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
register('../../hook.mjs', import.meta.url, registerOptions)

let unmatchedCalls = 0
let matchedCalls = 0
const unmatched = new Hook([join(tmpdir(), 'unmatched-iitm-module.mjs')], () => { unmatchedCalls++ })
/** @param {Record<string, unknown>} exports The wrapped module exports. */
function replaceExport (exports) {
  matchedCalls++
  exports.foo = 2
}
const matched = new Hook(['virtual-bad-fileurl'], replaceExport)

try {
  await waitForAllMessagesAcknowledged()
  const namespace = await import('virtual-bad-fileurl')

  strictEqual(unmatchedCalls, 0)
  strictEqual(matchedCalls, 1)
  strictEqual(namespace.foo, 2)
} finally {
  unmatched.unhook()
  matched.unhook()
}
