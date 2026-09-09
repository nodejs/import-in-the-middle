import { register, syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'
import { rejects, strictEqual, throws } from 'node:assert/strict'

import Hook, { addHook, createAddHookMessageChannel, removeHook } from '../../index.js'

const liveUrl = new URL('../fixtures/export-capability-live.mjs', import.meta.url)
const namedUrl = new URL('../fixtures/export-capability-named.mjs', import.meta.url)
const defaultUrl = new URL('../fixtures/export-capability-default.mjs', import.meta.url)
const commonJsUrl = new URL('../fixtures/index.js', import.meta.url)
const reexportUrl = new URL('../fixtures/reexport-same-source.mjs', import.meta.url)
const legacyUrl = new URL('../fixtures/export-capability-legacy.mjs', import.meta.url)
const livePath = fileURLToPath(liveUrl)
const namedPath = fileURLToPath(namedUrl)
const defaultPath = fileURLToPath(defaultUrl)
const commonJsPath = fileURLToPath(commonJsUrl)
const reexportPath = fileURLToPath(reexportUrl)
const legacyPath = fileURLToPath(legacyUrl)
const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

throws(
  () => new Hook([livePath], { replaceExports: 'all' }, () => {}),
  { message: /array of export names/ }
)
throws(
  () => new Hook([livePath], { replaceExports: [undefined] }, () => {}),
  { message: /array of export names/ }
)
throws(
  () => new Hook([livePath], { internals: true, replaceExports: [] }, () => {}),
  { message: /incompatible/ }
)

register('../../hook.mjs', import.meta.url, registerOptions)

// eslint-disable-next-line no-new
new Hook([livePath], { replaceExports: [] }, namespace => {
  namespace.state.hookCount++
  namespace.init()
  strictEqual(typeof namespace.Late, 'function')
  strictEqual(Object.getOwnPropertyDescriptor(namespace, 'Late').value, namespace.Late)
  throws(
    () => { namespace.Late = undefined },
    { name: 'TypeError', message: /not listed in 'replaceExports'/ }
  )
})

const removedHook = new Hook([livePath], () => {})
removedHook.unhook()
const removedLowLevelHook = () => {}
addHook(removedLowLevelHook)
removeHook(removedLowLevelHook)

// eslint-disable-next-line no-new
new Hook([namedPath], { replaceExports: ['first'] }, namespace => {
  namespace.state.hooked = true
  namespace.first = 'hooked first'
  throws(() => { namespace.untouched = 'changed' }, { name: 'TypeError' })
  throws(
    () => Object.defineProperty(namespace, 'untouched', { value: 'changed' }),
    { name: 'TypeError' }
  )
})

// eslint-disable-next-line no-new
new Hook([namedPath], { replaceExports: ['second'] }, namespace => {
  namespace.second = 'hooked second'
})

// eslint-disable-next-line no-new
new Hook([defaultPath], { replaceExports: [] }, () => function replacement () {})

// eslint-disable-next-line no-new
new Hook([reexportPath], { replaceExports: [] }, namespace => {
  strictEqual(namespace.val, 1)
})

// eslint-disable-next-line no-new
new Hook(['fs'], { replaceExports: [] }, namespace => {
  strictEqual(typeof namespace.readFile, 'function')
  throws(() => { namespace.readFile = undefined }, { name: 'TypeError' })
})

// eslint-disable-next-line no-new
new Hook(['fs'], { replaceExports: ['F_OK'] }, namespace => {
  if ('F_OK' in namespace) namespace.F_OK = 1234
})

// eslint-disable-next-line no-new
new Hook(['path'], { replaceExports: ['sep'] }, namespace => {
  namespace.sep = 'hooked separator'
  throws(() => { namespace.delimiter = undefined }, { name: 'TypeError' })
})

// Node.js 23 and later expose this marker on CommonJS namespaces.
// eslint-disable-next-line no-new
new Hook([commonJsPath], { replaceExports: [] }, namespace => {
  strictEqual(namespace.foo, 'something')
  if ('module.exports' in namespace) {
    throws(() => { namespace['module.exports'] = undefined }, { name: 'TypeError' })
  }
})

await waitForAllMessagesAcknowledged()

const live = await import('../fixtures/export-capability-live-consumer.mjs')
strictEqual(live.Sub.name, 'Sub')
strictEqual(live.AliasSub.name, 'AliasSub')
strictEqual(live.state.hookCount, 1)

const named = await import(namedUrl)
strictEqual(named.state.hooked, true)
strictEqual(named.first, 'hooked first')
strictEqual(named.second, 'hooked second')
strictEqual(named.untouched, 'original')

const reexport = await import(reexportUrl)
strictEqual(reexport.val, 1)

const fs = await import('node:fs')
strictEqual(typeof fs.readFile, 'function')
if ('F_OK' in fs.default) strictEqual(fs.F_OK, 1234)
const originalReadFile = fs.default.readFile
const replacementReadFile = () => {}
try {
  fs.default.readFile = replacementReadFile
  syncBuiltinESMExports()
  strictEqual(fs.readFile, replacementReadFile)
} finally {
  fs.default.readFile = originalReadFile
  syncBuiltinESMExports()
}

const path = await import('node:path')
strictEqual(path.sep, 'hooked separator')
strictEqual(typeof path.join, 'function')

const commonJs = await import(commonJsUrl)
strictEqual(commonJs.foo, 'something')

let futureHookCalls = 0
let failedHighLevelCalls = 0
let failedLowLevelCalls = 0
// eslint-disable-next-line no-new
new Hook([legacyPath], { replaceExports: [] }, namespace => {
  futureHookCalls++
  throws(
    () => { namespace.value = 'changed' },
    { name: 'TypeError', message: /not listed in 'replaceExports'/ }
  )
})
throws(() => {
  // eslint-disable-next-line no-new
  new Hook([livePath, legacyPath], { replaceExports: [] }, () => {
    failedHighLevelCalls++
    throw new Error('high-level replay failed')
  })
}, { message: 'high-level replay failed' })
throws(() => addHook(() => {
  failedLowLevelCalls++
  throw new Error('low-level replay failed')
}), { message: 'low-level replay failed' })

await waitForAllMessagesAcknowledged()

const legacy = await import(legacyUrl)
strictEqual(legacy.value, 'original')
strictEqual(futureHookCalls, 1)
strictEqual(failedHighLevelCalls, 1)
strictEqual(failedLowLevelCalls, 1)

await rejects(import(defaultUrl), { name: 'TypeError' })

throws(() => {
  // eslint-disable-next-line no-new
  new Hook([livePath], { replaceExports: ['Late'] }, namespace => {
    namespace.Late = class Replacement {}
  })
}, { name: 'TypeError' })
