import { strictEqual } from 'assert'
import Hook from '../../index.js'

let hookedBar

const hook = new Hook((exports, name) => {
  if (typeof name === 'string' && name.endsWith('circular-b.mjs')) {
    hookedBar = exports.bar
  }
})

const mod = await import('../fixtures/circular-b.mjs')

strictEqual(mod.bar, 2)
strictEqual(hookedBar, 2)

hook.unhook()
