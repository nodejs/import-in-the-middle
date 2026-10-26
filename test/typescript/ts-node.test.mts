import assert from 'node:assert/strict'
import defaultHook, { Hook, addHook } from '../../index.js'
import { sayHi } from '../fixtures/say-hi.mjs'

addHook((url, exported, specifier, format) => {
  const observedFormat: string | undefined = format
  if (url.toLowerCase().endsWith('say-hi.mts')) {
    assert.equal(typeof observedFormat, 'string')
    exported.sayHi = () => 'Hooked'
  }
})

new defaultHook((exported: any, name: string, baseDir: string|void)  => {

});

new Hook((exported: any, name: string, baseDir: string|void)  => {

});

assert.equal(sayHi('test'), 'Hooked')

new Hook((exported, name, baseDir, format) => {
  const observedFormat: string | undefined = format
  if (name.endsWith('say-hi.mts')) assert.equal(typeof observedFormat, 'string')
}).unhook()
