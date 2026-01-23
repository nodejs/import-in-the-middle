import { strictEqual } from 'assert'

import Hook from '../../index.js'

// Cover register.js proxyHandler branches where there is no setter.
const hook = new Hook((exports, name) => {
  if (typeof name === 'string' && name.match(/something\.mjs$/)) {
    // No such export exists; should not throw.
    exports.__does_not_exist__ = 1
    Object.defineProperty(exports, '__does_not_exist_2__', { value: 2 })
  }
})

const mod = await import('../fixtures/something.mjs')

strictEqual(mod.foo, 42)
strictEqual(typeof mod.default, 'function')

strictEqual(mod.__does_not_exist__, undefined)
strictEqual(mod.__does_not_exist_2__, undefined)

hook.unhook()
