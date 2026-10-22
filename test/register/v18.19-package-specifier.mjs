import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'

import Hook from '../../index.js'

process.env.TURBOPACK = '1'
register('../loaders/package-specifier.mjs', import.meta.url)
register('../../hook.mjs', import.meta.url)
let calls = 0
const hook = new Hook(['@scope/pkg'],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    calls++
    namespace.value = 42
  })

const plain = await import('@scope/pkg')
strictEqual(plain.value, 42)
const hashed = await import('@scope/pkg-0123456789abcdef')
strictEqual(hashed.value, 42)
const child = await import('@scope/pkg/internal.mjs')
strictEqual(child.value, 1)
const hyphenated = await import('@scope/pkg-0123456789abcdef/internal-file.mjs')
strictEqual(hyphenated.value, 1)
strictEqual(calls, 2)
hook.unhook()
