import assert from 'node:assert/strict'
import { addHook } from '../../index.js'
import { sayHi } from '../fixtures/say-hi.mjs'

addHook((url, exported) => {
  if (url.toLowerCase().endsWith('say-hi.mts')) {
    exported.sayHi = () => 'Hooked'
  }
})

assert.equal(sayHi('test'), 'Hooked')