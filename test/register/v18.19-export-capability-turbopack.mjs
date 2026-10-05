import { strictEqual, throws } from 'node:assert/strict'
import { register } from 'node:module'

import Hook, { createAddHookMessageChannel } from '../../index.js'

process.env.TURBOPACK = '1'
let legacyCalls = 0
let explicitCalls = 0
const legacy = new Hook(['@scope/pkg'],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    legacyCalls++
    namespace.value = 42
  })
const removed = new Hook(['@scope/pkg'], { replaceExports: [] }, () => {
  throw new Error('The removed hook must not run')
})
removed.unhook()

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
register('../loaders/export-capability-turbopack.mjs', import.meta.url)
register('../../hook.mjs', import.meta.url, registerOptions)
await waitForAllMessagesAcknowledged()

const unmatched = await import('unmatched-hash')
strictEqual(legacyCalls, 0)
unmatched.update()
strictEqual(unmatched.value, 2)

const legacyNamespace = await import('@scope/pkg-hash')
strictEqual(legacyNamespace.value, 42)
strictEqual(legacyCalls, 1)
legacy.unhook()
await waitForAllMessagesAcknowledged()

const explicit = new Hook(['other'], { replaceExports: [] },
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    explicitCalls++
    throws(() => { namespace.value = 42 }, { name: 'TypeError' })
  })
await waitForAllMessagesAcknowledged()

const explicitNamespace = await import('other-hash')
strictEqual(explicitNamespace.value, 1)
explicitNamespace.update()
strictEqual(explicitNamespace.value, 2)
strictEqual(explicitCalls, 1)
strictEqual(legacyCalls, 1)
explicit.unhook()
await waitForAllMessagesAcknowledged()
