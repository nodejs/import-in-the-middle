import Hook from '../../index.js'
import { foo } from '../fixtures/duplicate.mjs'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.endsWith('/duplicate.mjs')) {
    // The last export always takes priority
    strictEqual(exports.foo, 'b')
    exports.foo = '1'
  }
})

strictEqual(foo, '1')
