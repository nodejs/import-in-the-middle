import { strictEqual } from 'assert'
import Hook from '../../index.js'

// User-level scenario: importing a CJS module that uses package.json "imports"
// (#main-entry-point) should work under IITM.
const hook = new Hook(() => {})

const mod = await import('../fixtures/reexport-imports-field.js')
strictEqual(typeof mod.foo, 'number')

hook.unhook()
