import { strictEqual } from 'assert'
import Hook from '../../index.js'

const hook = new Hook(() => {})

const mod = await import('../fixtures/imports-node-default/reexport.js')
strictEqual(mod.default.foo, 1)

hook.unhook()
