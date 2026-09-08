import assert from 'node:assert/strict'
import defaultHook, { Hook, addHook, removeHook } from '../../index.js'
import { sayHi } from '../fixtures/say-hi.mjs'

addHook((url, exported) => {
  if (url.toLowerCase().endsWith('say-hi.mts')) {
    exported.sayHi = () => 'Hooked'
  }
})

new defaultHook(() => {})
new Hook(() => {})

function checkHookExportTypes () {
  const callableHook = new Hook((exported: (value: string) => string) => exported('test'))
  callableHook.unhook()

  const primitiveHook = (url: string, exported: number) => exported + url.length
  addHook(primitiveHook)
  removeHook(primitiveHook)
}

void checkHookExportTypes

assert.equal(sayHi('test'), 'Hooked')
