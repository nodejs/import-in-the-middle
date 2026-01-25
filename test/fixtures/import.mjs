import { register } from 'module'
import { Hook, createAddHookMessageChannel } from '../../index.js'
// We've imported path here to ensure that the hook is still applied later even
// if the library is used here.
import * as path from 'path'

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

// Use the test harness loader so IITM doesn't wrap its own implementation files
// (keeps c8 coverage attribution sane).
register('../generic-loader.mjs', import.meta.url, registerOptions)

Hook(['path'], (exports) => {
  exports.sep = '@'
})

Hook(['os'], (exports) => {
  exports.arch = function () {
    return 'new_crazy_arch'
  }
})

console.assert(path.sep !== '@')

await waitForAllMessagesAcknowledged()
