import { strictEqual } from 'assert'
import Hook from '../../index.js'

// User-level scenario: a CJS module may `require()` a missing #imports entry
// inside a try/catch. Under IITM this should still load and not crash.
const hook = new Hook(() => {})

const mod = await import('../fixtures/imports-node-default/reexport-missing-try.js')
strictEqual(typeof mod, 'object')

hook.unhook()
