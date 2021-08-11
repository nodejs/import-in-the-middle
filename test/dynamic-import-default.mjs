import { addHook } from '../index.mjs'
import { strictEqual } from 'assert'

addHook((name, exports) => {
  if (name.match(/something\.m?js/)) {
    const orig = exports.default
    exports.default = function bar() {
      return orig() + 15
    }
  }
})

;(async () => {
  const { default: barMjs } = await import('./fixtures/something.mjs')
  const { default: barJs } = await import('./fixtures/something.js')

  strictEqual(barMjs(), 57)
  strictEqual(barJs(), 57)
})()
