import { strictEqual } from 'assert'
import Hook from '../../index.js'

let called = false

const hook = new Hook(['virtual-bad-fileurl'], (exports) => {
  called = true
  exports.foo = 2
})

const mod = await import('virtual-bad-fileurl')

strictEqual(called, true)
strictEqual(mod.foo, 2)

hook.unhook()
