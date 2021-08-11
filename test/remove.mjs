import { addHook, removeHook } from '../index.mjs'
import { strictEqual } from 'assert'

const hook = (name, exports) => {
  if (name.match(/something\.m?js/)) {
    exports.foo += 15
  }
}

addHook(hook)

;(async () => {
  const { foo: fooMjs } = await import('./fixtures/something.mjs')

  removeHook(hook)

  const { foo: fooJs } = await import('./fixtures/something.js')

  strictEqual(fooMjs, 57)
  strictEqual(fooJs, 42)
})()
