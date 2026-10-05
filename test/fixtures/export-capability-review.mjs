import { strictEqual, throws } from 'node:assert/strict'
import { register as registerAsync, syncBuiltinESMExports } from 'node:module'
import * as nodeModule from 'node:module'
import { fileURLToPath } from 'node:url'

import * as virtualLoader from '../loaders/export-capability-virtual.mjs'

import Hook, { createAddHookMessageChannel } from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

/** @param {'sync' | 'async'} mode */
export async function reviewCapabilities (mode) {
  if (mode === 'sync' && !supportsSyncHooks()) return
  let acknowledge = async () => {}
  if (mode === 'sync') {
    nodeModule.registerHooks({ resolve: virtualLoader.resolve, load: virtualLoader.load })
    register({ include: [/fixtures/, 'events', 'virtual-live-capability', 'virtual-bad-capability'] })
  } else {
    const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
    registerAsync('../loaders/export-capability-virtual.mjs', import.meta.url)
    registerOptions.data.include = [/fixtures/, 'events', 'virtual-live-capability', 'virtual-bad-capability']
    registerAsync('../../hook.mjs', import.meta.url, registerOptions)
    acknowledge = waitForAllMessagesAcknowledged
  }

  const diamondUrl = new URL('./reexport-same-source.mjs', import.meta.url)
  const liveUrl = new URL('./export-capability-live.mjs', import.meta.url)
  const namesUrl = new URL('./export-name-collision.mjs', import.meta.url)
  const commonJsUrl = new URL('./index.js', import.meta.url)
  let diamondCalls = 0
  let liveCalls = 0
  let namesCalls = 0
  let commonJsCalls = 0
  let builtinCalls = 0

  // eslint-disable-next-line no-new
  new Hook([fileURLToPath(diamondUrl)], { replaceExports: [] }, namespace => {
    diamondCalls++
    strictEqual(namespace.val, 1)
    throws(() => { namespace.val = 2 }, { name: 'TypeError' })
  })
  // eslint-disable-next-line no-new
  new Hook([fileURLToPath(liveUrl)], { replaceExports: ['state'] }, namespace => {
    liveCalls++
    namespace.init()
    strictEqual(typeof namespace.Late, 'function')
    namespace.state = { hookCount: 42 }
    throws(() => { namespace.Late = undefined }, { name: 'TypeError' })
    throws(() => Object.defineProperty(namespace, 'Alias', { value: undefined }), { name: 'TypeError' })
  })
  // eslint-disable-next-line no-new
  new Hook([fileURLToPath(namesUrl)], { replaceExports: ['absent'] }, namespace => {
    namesCalls++
    strictEqual(namespace['a-b'], 'dashed')
    strictEqual(Reflect.get(namespace, '__proto__'), 'proto')
    strictEqual(namespace.a_b, 'underscored')
    throws(() => { namespace['a-b'] = 'changed' }, { name: 'TypeError' })
  })
  // eslint-disable-next-line no-new
  new Hook([fileURLToPath(commonJsUrl)], { replaceExports: [] }, namespace => {
    commonJsCalls++
    strictEqual(namespace.foo, 'something')
    throws(() => { namespace.foo = 'changed' }, { name: 'TypeError' })
  })
  // eslint-disable-next-line no-new
  new Hook(['events'], { replaceExports: [] }, namespace => {
    builtinCalls++
    strictEqual(namespace.prototype, namespace.default.prototype)
    throws(() => { namespace.EventEmitter = undefined }, { name: 'TypeError' })
  })
  let virtualCalls = 0
  let badUrlCalls = 0
  // eslint-disable-next-line no-new
  new Hook(['virtual-live-capability'], { replaceExports: [] }, namespace => {
    virtualCalls++
    strictEqual(namespace.value, 1)
  })
  // eslint-disable-next-line no-new
  new Hook(['virtual-bad-capability'], namespace => {
    badUrlCalls++
    namespace.value = 3
  })
  await acknowledge()

  const virtual = await import('virtual-live-capability')
  virtual.update()
  strictEqual(virtual.value, 2)
  strictEqual(virtualCalls, 1)
  const badUrl = await import('virtual-bad-capability')
  strictEqual(badUrl.value, 3)
  strictEqual(badUrlCalls, 1)

  const diamond = await import(diamondUrl)
  strictEqual(diamond.val, 1)
  strictEqual(diamondCalls, 1)
  const live = await import('./export-capability-live-consumer.mjs')
  strictEqual(live.Sub.name, 'Sub')
  strictEqual(live.AliasSub.name, 'AliasSub')
  strictEqual(live.state.hookCount, 42)
  strictEqual(liveCalls, 1)
  const names = await import(namesUrl)
  strictEqual(names['a-b'], 'dashed')
  strictEqual(Reflect.get(names, '__proto__'), 'proto')
  strictEqual(namesCalls, 1)
  const commonJs = await import(commonJsUrl)
  strictEqual(commonJs.foo, 'something')
  if (Number(process.versions.node.split('.')[0]) >= 23) {
    strictEqual(Object.hasOwn(commonJs, 'module.exports'), true)
    strictEqual(commonJs['module.exports'], commonJs.default)
  }
  strictEqual(commonJsCalls, 1)
  const events = await import('node:events')
  strictEqual(events.prototype, events.default.prototype)
  strictEqual(builtinCalls, 1)
  const originalOnce = events.default.once
  const replacementOnce = () => {}
  try {
    events.default.once = replacementOnce
    syncBuiltinESMExports()
    strictEqual(events.once, replacementOnce)
  } finally {
    events.default.once = originalOnce
    syncBuiltinESMExports()
  }
}
