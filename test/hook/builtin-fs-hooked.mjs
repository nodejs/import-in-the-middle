import { strictEqual } from 'assert'
import Hook from '../../index.js'

let sawFs = false
const hook = new Hook(['fs'], (exports, name, baseDir, format) => {
  if (name === 'fs') {
    sawFs = true
    strictEqual(format, 'builtin')
    strictEqual(typeof exports.readFile, 'function')
  }
})

;(async () => {
  await import('fs')
  strictEqual(sawFs, true)

  hook.unhook()
})()
