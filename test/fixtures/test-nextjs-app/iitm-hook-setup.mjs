import { strictEqual, throws } from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const iitmPath = process.env.IITM_PATH
if (iitmPath) {
  const { Hook, createAddHookMessageChannel } = await import(pathToFileURL(iitmPath))
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
  register(new URL('hook.mjs', pathToFileURL(iitmPath)), import.meta.url, registerOptions)

  Hook(['camelcase'], { replaceExports: null },
    /** @param {import('../../../index.js').Namespace} namespace */
    namespace => {
      strictEqual(typeof namespace.default, 'function')
      throws(() => { namespace.default = undefined }, { name: 'TypeError' })
      process.stdout.write('IITM_HOOK_TRIGGERED:camelcase\n')
    })

  await waitForAllMessagesAcknowledged()
}
