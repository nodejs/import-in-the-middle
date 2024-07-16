import { register } from 'module'
import { Hook, createAddHookMessageChannel } from '../../index.js'

const addHookMessagePort = createAddHookMessageChannel()

register('../../hook.mjs', import.meta.url, { data: { addHookMessagePort }, transferList: [addHookMessagePort] })

Hook(['path'], (exports) => {
  exports.sep = '@'
})
