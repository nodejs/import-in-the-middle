import { strictEqual } from 'assert'
import Hook from '../../index.js'

let fsHooked = false
let wrapFailureHooked = false

const hook = new Hook(['fs', 'virtual-wrap-failure'], (exports, name, baseDir) => {
  if (name === 'fs') {
    fsHooked = true
  }
  if (name === 'virtual-wrap-failure') {
    wrapFailureHooked = true
  }
})

await import('node:fs')
strictEqual(fsHooked, true)

// When IITM fails to wrap, it should fall back to the parent loader and the
// module should still load. But it can't be Hook'ed since it wasn't wrapped.
// @ts-expect-error - resolved by the test loader
const wrapFail = await import('virtual-wrap-failure')
strictEqual(wrapFail.ok, 1)
strictEqual(wrapFailureHooked, false)

hook.unhook()
