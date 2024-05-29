import { strictEqual } from 'assert'
import Hook from '../../index.js'
Hook((exports, name) => {
  if (/got-alike\.mjs/.test(name) === false) return

  const renamedDefaultExport = exports.renamedDefaultExport
  exports.renamedDefaultExport = function bazWrapped () {
    return renamedDefaultExport() + '-wrapped'
  }
})

/* eslint-disable import/no-named-default */
import {
  default as Got,
  renamedDefaultExport
} from '../fixtures/got-alike.mjs'

const got = new Got()
strictEqual(got.foo, 'foo')

strictEqual(renamedDefaultExport(), 'baz-wrapped')
