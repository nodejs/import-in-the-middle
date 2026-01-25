import { strictEqual } from 'assert'
import Hook from '../../index.js'

const hook = new Hook((exports, name) => {
  if (typeof name === 'string' && name.endsWith('something.mjs')) {
    exports.foo += 1
  }
})

const mod = await import('./something.mjs')
strictEqual(mod.foo, 43)

hook.unhook()
