import { strictEqual } from 'assert'
import Hook from '../../index.js'

// 1) If a hook returns a replacement default and the module has a default export,
// it should be applied.
{
  const hook = Hook((exports, name) => {
    if (typeof name === 'string' && name.match(/default-expression-array\.mjs$/)) {
      return ['replaced']
    }
  })

  const mod = await import('../fixtures/export-types/default-expression-array.mjs')
  strictEqual(Array.isArray(mod.default), true)
  strictEqual(mod.default[0], 'replaced')
  hook.unhook()
}

// 2) If a hook returns a value but the module has no default export, it must not crash.
{
  const hook = Hook((exports, name) => {
    if (typeof name === 'string' && name.match(/something\.mjs$/)) {
      return { nope: true }
    }
  })

  const mod = await import('../fixtures/something.mjs')
  strictEqual(typeof mod.foo, 'number')
  hook.unhook()
}
