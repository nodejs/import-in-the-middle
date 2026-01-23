import { strictEqual } from 'assert'
import Hook from '../../index.js'

const hook = new Hook((exports, name) => {
  if (typeof name === 'string' && name.endsWith('test/fixtures/something.js')) {
    exports.foo = 100
  }
})

const mod = await import('./something.js')
strictEqual(mod.foo, 100)

hook.unhook()
