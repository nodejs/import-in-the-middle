import * as lib from '../fixtures/duplicate.mjs'
import { notEqual, strictEqual } from 'assert'
import Hook from '../../index.js'

Hook((exports, name) => {
  if (name.match(/duplicate\.mjs/)) {
    // foo should not be exported because there are duplicate exports
    strictEqual(exports.foo, undefined)
    // default should be exported
    strictEqual(exports.default, 'foo')
  }
})

notEqual(lib, undefined)

// foo should not be exported because there are duplicate exports
strictEqual(lib.foo, undefined)
// default should be exported
strictEqual(lib.default, 'foo')
