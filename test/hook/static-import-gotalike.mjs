import { strictEqual } from 'assert'
import Hook from '../../index.js'
Hook((exports, name) => {
  if (/got-alike\.mjs/.test(name) === false) return

  const bar = exports.default
  exports.default = function barWrapped () {
    return bar() + '-wrapped'
  }
})

import {
  default as bar,
  got
} from '../fixtures/got-alike.mjs'

strictEqual(bar(), '42-wrapped')
strictEqual(got.foo, 'foo')

