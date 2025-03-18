import * as lib from '../fixtures/duplicate-same-source.mjs'
import { notEqual, strictEqual } from 'assert'
import Hook from '../../index.js'

Hook((exports, name) => {
  if (name.match(/duplicate-same-source\.mjs/)) {
    // foo should be exported because it comes from the same source
    strictEqual('foo' in exports, true)
  }
})

notEqual(lib, undefined)

// foo should be exported because it comes from the same source
strictEqual('foo' in lib, true)
