import { strictEqual } from 'assert'
import Hook from '../../index.js'
Hook((exports, name) => {
  if (/got-alike\.mjs/.test(name) === false) return

  const bar = exports.something
  exports.something = function barWrapped () {
    return bar() + '-wrapped'
  }

  const renamedDefaultExport = exports.renamedDefaultExport
  exports.renamedDefaultExport = function bazWrapped () {
    return renamedDefaultExport() + '-wrapped'
  }
})

/* eslint-disable import/no-named-default */
/* eslint-disable camelcase */
import {
  default as Got,
  something,
  defaultClass as DefaultClass,
  snake_case,
  renamedDefaultExport
} from '../fixtures/got-alike.mjs'

strictEqual(something(), '42-wrapped')
const got = new Got()
strictEqual(got.foo, 'foo')

const dc = new DefaultClass()
strictEqual(dc.value, 'DefaultClass')

strictEqual(snake_case, 'snake_case')
strictEqual(renamedDefaultExport(), 'baz-wrapped')
