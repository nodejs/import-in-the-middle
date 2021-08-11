import { addHook } from '../index.mjs'
import barMjs from './fixtures/something.mjs'
import barJs from './fixtures/something.js'
import { strictEqual } from 'assert'

addHook((name, exports) => {
  if (name.match(/something\.m?js/)) {
    const orig = exports.default
    exports.default = function bar() {
      return orig() + 15
    }
  }
})

strictEqual(barMjs(), 57)
strictEqual(barJs(), 57)
