// Test that a builtin module that must use 'node:' prefix works.
import { strictEqual } from 'assert'
import Hook from '../../index.js'

Hook(['node:test'], (exports, name) => {
  if (name === 'node:test') {
    exports.skip = 'iitm was here'
  }
})

const { skip } = await import('node:test')
strictEqual(skip, 'iitm was here')
