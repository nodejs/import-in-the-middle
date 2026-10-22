import { notStrictEqual, strictEqual, throws } from 'node:assert/strict'
import * as events from 'node:events'
import * as nodeModule from 'node:module'

import * as virtualLoader from '../loaders/export-capability-virtual.mjs'

import Hook, { createAddHookMessageChannel } from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

/** @param {'sync' | 'async'} mode */
export async function reviewCapabilityFormats (mode) {
  if (mode === 'sync' && !supportsSyncHooks()) return

  const cases = [
    ['star-builtin.mjs', 'EventEmitter'],
    ['export-capability-star-commonjs.mjs', 'state'],
    ['export-capability-star-virtual.mjs', 'state']
  ]
  const urls = cases.flatMap(([filename]) => [0, 1, 2].map(index => {
    const url = new URL(filename, import.meta.url)
    url.searchParams.set('permission', index)
    return url
  }))
  let acknowledge = async () => {}
  if (mode === 'sync') {
    nodeModule.registerHooks({ resolve: virtualLoader.resolve, load: virtualLoader.load })
    register({ include: urls.map(url => url.href) })
  } else {
    const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
    nodeModule.register('../loaders/export-capability-virtual.mjs', import.meta.url)
    registerOptions.data.include = urls.map(url => url.href)
    nodeModule.register('../../hook.mjs', import.meta.url, registerOptions)
    acknowledge = waitForAllMessagesAcknowledged
  }

  let urlIndex = 0
  for (const [filename, replaceable] of cases) {
    for (const replaceExports of [null, [], [replaceable]]) {
      const url = urls[urlIndex++]
      const partial = replaceExports?.length === 1
      let calls = 0
      const replacement = () => {}
      const hook = new Hook([url.href], { replaceExports }, namespace => {
        calls++
        const readonly = filename === 'star-builtin.mjs' ? 'once' : 'Late'
        throws(() => { namespace[readonly] = undefined }, { name: 'TypeError' })
        if (partial) namespace[replaceable] = replacement
      })
      try {
        await acknowledge()
        const namespace = await import(url)
        strictEqual(calls, 1)
        if (partial) strictEqual(namespace[replaceable], replacement)
        if (filename === 'star-builtin.mjs') {
          const originalOnce = events.default.once
          try {
            events.default.once = replacement
            nodeModule.syncBuiltinESMExports()
            strictEqual(events.once, replacement)
            strictEqual(namespace.once, replacement)
          } finally {
            events.default.once = originalOnce
            nodeModule.syncBuiltinESMExports()
          }
        } else {
          const originalLate = namespace.Late
          namespace.init()
          notStrictEqual(namespace.Late, originalLate)
          strictEqual(namespace.default, namespace.Late)
          if (filename === 'export-capability-star-commonjs.mjs') {
            strictEqual(namespace.foo, 'something')
          } else {
            namespace.update()
            strictEqual(namespace.value, 2)
          }
        }
      } finally {
        hook.unhook()
        await acknowledge()
      }
    }
  }
}
