import { strictEqual } from 'assert'
import { sep } from 'path'
import { Hook } from '../../index.js'

const hooked = []

Hook((_, name) => {
  hooked.push(name)
})

strictEqual(hooked.length, 1)
strictEqual(hooked[0], 'path')
strictEqual(sep, '@')
