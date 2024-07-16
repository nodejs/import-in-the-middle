import { register } from 'module'
import { Hook, createAddHookMessageChannel } from '../../index.js'
// We've imported path here to ensure that the hook is still applied later even
// if the library is used here.
import * as path from 'path'

const { addHookMessagePort, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

register('../../hook.mjs', import.meta.url, { data: { addHookMessagePort }, transferList: [addHookMessagePort] })

Hook(['path'], (exports) => {
  exports.sep = '@'
})

console.assert(path.sep !== '@')

await waitForAllMessagesAcknowledged()
