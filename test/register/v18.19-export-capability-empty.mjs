import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

import Hook, { createAddHookMessageChannel } from '../../index.js'

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
register('../../hook.mjs', import.meta.url, registerOptions)

// Check selection before the first hook and after the last hook is removed.
for (const filename of ['export-capability-named.mjs', 'export-capability-isolated.mjs']) {
  const url = new URL('../fixtures/' + filename, import.meta.url)
  const namespace = await import(url)
  let calls = 0
  const hook = new Hook([fileURLToPath(url)], () => { calls++ })
  strictEqual(calls, 0)
  strictEqual(namespace.first, 'original first')
  hook.unhook()
  await waitForAllMessagesAcknowledged()
}
