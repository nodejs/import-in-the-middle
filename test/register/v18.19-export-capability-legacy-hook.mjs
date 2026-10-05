import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

import Hook, { createAddHookMessageChannel } from '../../index.js'

const moduleUrl = new URL('../fixtures/export-capability-legacy.mjs', import.meta.url)
const modulePath = fileURLToPath(moduleUrl)

// eslint-disable-next-line no-new
new Hook([modulePath], { replaceExports: [] }, () => {})

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
register('../../hook.mjs', import.meta.url, registerOptions)

// A legacy hook for the same module keeps every export replaceable.
// eslint-disable-next-line no-new
new Hook([modulePath], namespace => {
  namespace.value = 'hooked'
})

await waitForAllMessagesAcknowledged()

const namespace = await import(moduleUrl)
strictEqual(namespace.value, 'hooked')
