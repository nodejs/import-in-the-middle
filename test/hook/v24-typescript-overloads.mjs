import { strictEqual } from 'assert'
import Hook from '../../index.js'

let hooked = false

// eslint-disable-next-line no-new
new Hook((exports, name) => {
  if (name.endsWith('typescript-overloads.mts')) {
    hooked = true
    exports.other = 2
  }
})

const mod = await import('../fixtures/typescript-overloads.mts')

strictEqual(hooked, true)
strictEqual(mod.any('a'), 'a')
strictEqual(mod.any(1), 1)
strictEqual(mod.other, 2)
strictEqual(Object.keys(mod).length, 2)
