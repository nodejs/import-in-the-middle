import { register, registerHooks } from 'module'
import Hook from '../../index.js'
import { strictEqual } from 'assert'

register('../../hook.mjs', import.meta.url)

registerHooks({
  load: (url, context, defaultLoad) => {
    return defaultLoad(url, context)
  }
})

let bar

Hook((exports, name) => {
  if (name.match(/circular-b.mjs/)) {
    bar = exports.bar
  }
})

await import('../fixtures/circular-b.mjs')

strictEqual(bar, 2)
