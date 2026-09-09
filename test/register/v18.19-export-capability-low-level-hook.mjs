import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

import Hook, { addHook, createAddHookMessageChannel } from '../../index.js'

const moduleUrl = new URL('../fixtures/export-capability-legacy.mjs', import.meta.url)
const modulePath = fileURLToPath(moduleUrl)
const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

register('../../hook.mjs', import.meta.url, registerOptions)

// eslint-disable-next-line no-new
new Hook([modulePath], { replaceExports: [] }, () => {})
addHook((url, namespace) => {
  if (url === moduleUrl.href) namespace.value = 'hooked'
})

await waitForAllMessagesAcknowledged()

const namespace = await import(moduleUrl)
strictEqual(namespace.value, 'hooked')
