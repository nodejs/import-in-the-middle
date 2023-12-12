// The purpose of this test is to prove that CJS modules:
// 1. Hooks apply to the added `default` export.
// 2. Hooks apply to the "named" exports.

import Hook from '../../index.js'
import { strictEqual } from 'assert'
import * as something from '../fixtures/cjs-exports.js'

Hook((exports, name) => {
  if (/cjs-exports\.js$/.test(name) === false) return
  const add = exports.add
  exports.add = function wrappedAdd(a, b) {
    return 'wrapped: ' + add(a, b)
  }

  const namedName = exports.name
  exports.name = `${namedName}-hooked`
})

strictEqual(something.default.add(2, 2), 'wrapped: 4')
strictEqual(something.add(2, 2), 'wrapped: 4')

strictEqual(something.default.name, 'foo-hooked')
strictEqual(something.name, 'foo-hooked')
