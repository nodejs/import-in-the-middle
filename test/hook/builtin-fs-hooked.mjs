import { strictEqual } from 'assert'
import Hook from '../../index.js'

let sawFs = false
const hook = new Hook(['fs'], (exports, name) => {
  if (name === 'fs') {
    sawFs = true
    strictEqual(typeof exports.readFile, 'function')
  }
})

;(async () => {
  await import('fs')
  strictEqual(sawFs, true)

  hook.unhook()
})()
