import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

import Hook, { addHook, createAddHookMessageChannel, removeHook } from '../../index.js'

const moduleUrl = new URL('../fixtures/export-capability-legacy.mjs', import.meta.url)
const modulePath = fileURLToPath(moduleUrl)
const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

register('../../hook.mjs', import.meta.url, registerOptions)

// eslint-disable-next-line no-new
new Hook([modulePath], { replaceExports: [] }, () => {})
let hookCalls = 0
/**
 * @param {string} url
 * @param {import('../../index.js').Namespace} namespace
 */
function lowLevelHook (url, namespace) {
  if (url === moduleUrl.href) {
    hookCalls++
    namespace.value = 'hooked'
  }
}
addHook(lowLevelHook)
addHook(lowLevelHook)
removeHook(lowLevelHook)

await waitForAllMessagesAcknowledged()

const namespace = await import(moduleUrl)
strictEqual(namespace.value, 'hooked')
strictEqual(hookCalls, 1)
removeHook(lowLevelHook)
await waitForAllMessagesAcknowledged()
