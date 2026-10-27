import { strictEqual } from 'node:assert/strict'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

import Hook, { createAddHookMessageChannel } from '../../index.js'

process.env.TURBOPACK = '1'
let legacyCalls = 0
let explicitCalls = 0
const legacy = new Hook(['@scope/pkg'],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    legacyCalls++
    namespace.value = 42
  })
const removed = new Hook(['@scope/pkg'], () => {
  throw new Error('The removed hook must not run')
})
removed.unhook()

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
registerOptions.data.include.push('@scope/pkg/internal.mjs', 'local-0123456789abcdef')
register('../loaders/selective-turbopack.mjs', import.meta.url)
register('../../hook.mjs', import.meta.url, registerOptions)
await waitForAllMessagesAcknowledged()

const outside = new Hook(['outside'], { internals: true }, () => {
  throw new Error('An outside alias must not match a package hook')
})
await waitForAllMessagesAcknowledged()
await import('outside-0123456789abcdef')
outside.unhook()
await waitForAllMessagesAcknowledged()

const unmatched = await import('unmatched-0123456789abcdef')
strictEqual(legacyCalls, 0)
unmatched.update()
strictEqual(unmatched.value, 2)

const internal = await import('@scope/pkg/internal.mjs')
strictEqual(legacyCalls, 0)
strictEqual(internal.value, 1)

const plain = await import('@scope/pkg')
strictEqual(plain.value, 42)
strictEqual(legacyCalls, 1)

const legacyNamespace = await import('@scope/pkg-0123456789abcdef')
strictEqual(legacyNamespace.value, 42)
strictEqual(legacyCalls, 2)

const subpath = await import('@scope/pkg-0123456789abcdef/subpath.mjs')
strictEqual(subpath.value, 42)
strictEqual(legacyCalls, 3)

const hyphenatedSubpath = await import('@scope/pkg-0123456789abcdef/internal-file.mjs')
strictEqual(legacyCalls, 3)
strictEqual(hyphenatedSubpath.value, 1)
hyphenatedSubpath.update()
strictEqual(hyphenatedSubpath.value, 2)
legacy.unhook()
await waitForAllMessagesAcknowledged()

const explicit = new Hook(['other'],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    explicitCalls++
    namespace.value = 42
  })
await waitForAllMessagesAcknowledged()

const explicitNamespace = await import('other-0123456789abcdef')
strictEqual(explicitNamespace.value, 42)
explicitNamespace.update()
strictEqual(explicitNamespace.value, 42)
strictEqual(explicitCalls, 1)
strictEqual(legacyCalls, 3)
explicit.unhook()
await waitForAllMessagesAcknowledged()

let rootCalls = 0
const root = new Hook(['root'],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    rootCalls++
    namespace.value = 42
  })
await waitForAllMessagesAcknowledged()

const rootNamespace = await import('root-0123456789abcdef')
rootNamespace.update()
strictEqual(rootNamespace.value, 42)
strictEqual(rootCalls, 1)
root.unhook()
await waitForAllMessagesAcknowledged()

const local = new Hook(['local'], () => {
  throw new Error('A hashed local alias must not match a package hook')
})
const localPath = fileURLToPath(new URL('../fixtures/turbopack-virtual/local.mjs', import.meta.url))
const absolute = new Hook([localPath],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    namespace.value = 42
  })
await waitForAllMessagesAcknowledged()

const localNamespace = await import('local-0123456789abcdef')
strictEqual(localNamespace.value, 42)
local.unhook()
absolute.unhook()
await waitForAllMessagesAcknowledged()

let hyphenatedCalls = 0
const hyphenated = new Hook(['hyphenated-package'],
  /** @param {import('../../index.js').Namespace} namespace */
  namespace => {
    hyphenatedCalls++
    namespace.value = 42
  })
await waitForAllMessagesAcknowledged()

for (const specifier of [
  'hyphenated-packages-0123456789abcdef',
  'hyphenated-package-0123456789abcde',
  'hyphenated-package-0123456789abcdef0',
  'hyphenated-package-0123456789abcdeg',
  'hyphenated-package-extra-0123456789abcdef',
  'hyphenated-package-0123456789abcdef/wrong-package'
]) {
  const namespace = await import(specifier)
  strictEqual(hyphenatedCalls, 0)
  namespace.update()
  strictEqual(namespace.value, 2)
}

const hyphenatedNamespace = await import('hyphenated-package-0123456789abcdef')
strictEqual(hyphenatedNamespace.value, 42)
hyphenatedNamespace.update()
strictEqual(hyphenatedNamespace.value, 42)
strictEqual(hyphenatedCalls, 1)
hyphenated.unhook()
await waitForAllMessagesAcknowledged()
