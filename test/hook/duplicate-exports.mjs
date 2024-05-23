import Hook from '../../index.js'
import { foo } from '../fixtures/duplicate.mjs'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.endsWith('/duplicate.mjs')) {
    exports.foo = '1'
  }
})

strictEqual(foo, '1')
