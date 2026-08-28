import { strictEqual } from 'assert'

import Hook from '../../index.js'

const hook = new Hook(() => {})
const module = await import('../fixtures/cjs-reexport-esm-star.js')

strictEqual(module.nested, 42)

hook.unhook()
