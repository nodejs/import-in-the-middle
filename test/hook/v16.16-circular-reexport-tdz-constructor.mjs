import { strictEqual } from 'assert'
import Hook from '../../index.js'

// Install a hook to mirror typical IITM usage; the bug is in wrapping, not the hook body.
const hook = new Hook(() => {})

const mod = await import('../fixtures/reexport-tdz-cycle-b.mjs')

// The fixture initializes the export via setTimeout, so native ESM also cannot
// guarantee it's ready immediately after import resolution.
await new Promise((resolve) => setTimeout(resolve, 20))

strictEqual(typeof mod.RunTree, 'function')
strictEqual(new mod.RunTree().ok, true)
strictEqual(mod.make().ok, true)

hook.unhook()
