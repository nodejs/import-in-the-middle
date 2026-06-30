import { fromSelf } from '../fixtures/self-star-reexport.mjs'
import Hook from '../../index.js'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.endsWith('self-star-reexport.mjs')) {
    exports.fromSelf &&= exports.fromSelf + 10
  }
})

strictEqual(fromSelf, 11)
