import { strictEqual } from 'assert'
import Hook from '../../index.js'

class OverrideRunTree {
  constructor () {
    this.override = true
  }
}

const hook = new Hook((exports, name) => {
  // Override the export on the *source* module so importers (and re-exporters)
  // see the overridden value, and to ensure pending refreshes don't overwrite it.
  if (typeof name === 'string' && name.endsWith('reexport-tdz-cycle-a.mjs')) {
    exports.RunTree = OverrideRunTree
  }
})

const mod = await import('../fixtures/reexport-tdz-cycle-b.mjs')

// Give the fixture's setTimeout(5) a chance to fire; the Hook override should win.
await new Promise((resolve) => setTimeout(resolve, 30))

strictEqual(mod.RunTree, OverrideRunTree)
strictEqual(mod.make().override, true)

hook.unhook()
