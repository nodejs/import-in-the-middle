import { fromA, fromB } from '../fixtures/circular-star-a.mjs'
import Hook from '../../index.js'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.match(/circular-star-[ab].mjs/)) {
    exports.fromA &&= exports.fromA + 10
    exports.fromB &&= exports.fromB + 10
  }
})

strictEqual(fromA, 11)
strictEqual(fromB, 12)
