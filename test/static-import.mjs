import { addHook } from '../index.mjs'
import { foo as fooMjs } from './fixtures/something.mjs'
import { foo as fooJs } from './fixtures/something.js'
import { strictEqual } from 'assert'

addHook((name, exports) => {
  if (name.match(/something\.m?js/)) {
    exports.foo += 15
  }
})

strictEqual(fooMjs, 57)
strictEqual(fooJs, 57)
