import { register } from 'module'
import { Hook, createAddHookMessageChannel } from '../../index.js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const fooPath = join(dirname(fileURLToPath(import.meta.url)), 'foo.mjs')

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

// Use the test harness loader so IITM doesn't wrap its own implementation files
// (keeps c8 coverage attribution sane).
register('../generic-loader.mjs', import.meta.url, registerOptions)

global.hooked = []

Hook([fooPath], (_, name) => {
  global.hooked.push(name)
})

await waitForAllMessagesAcknowledged()
