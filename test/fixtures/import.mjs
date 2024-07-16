import { register } from 'module'
import { Hook, createAddHookMessageChannel } from '../../index.js'
// We've imported path here to ensure that the hook is still applied later.
import * as path from 'path'

const addHookMessagePort = createAddHookMessageChannel()

register('../../hook.mjs', import.meta.url, { data: { addHookMessagePort }, transferList: [addHookMessagePort] })

Hook(['path'], (exports) => {
  exports.sep = '@'
})

console.assert(path.sep !== '@')
