import { addHook } from '../../index.js'
import {  foo  } from '../fixtures/something.mjs'
import { strictEqual } from 'assert'
let specifier

addHook(function (name, namespace, specifierParam ) {
  if (name.includes('something.mjs')) {
    specifier = specifierParam
  }
})

strictEqual(specifier, '../fixtures/something.mjs')
strictEqual(foo, 42)
