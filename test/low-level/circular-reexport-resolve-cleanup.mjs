import { rejects, strictEqual, throws } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import { fileURLToPath } from 'node:url'

import { createHook } from '../../create-hook.mjs'

const meta = { url: new URL('../../hook.mjs', import.meta.url).href }
const conditions = ['import']
const missingError = Object.assign(new Error('missing module'), { code: 'ERR_MODULE_NOT_FOUND' })

/**
 * @param {string} prefix A unique file URL prefix for one hook mode.
 */
function createVirtualLoader (prefix) {
  const rootURLs = [1, 2, 3].map(index => `file:///${prefix}-root-${index}.mjs`)
  const consumerURL = `file:///${prefix}-consumer.mjs`
  const sources = new Map([
    ...rootURLs.map(rootURL => [
      rootURL,
      `export * from './${prefix}-error.mjs'; export * from './${prefix}-registry.mjs'`
    ]),
    [`file:///${prefix}-error.mjs`, 'export class UserError extends Error {}'],
    [`file:///${prefix}-registry.mjs`, `export * from './${prefix}-consumer.mjs'`],
    [consumerURL, `
import { UserError } from '${prefix}-alias'
import './${prefix}-root-1.mjs'
import './${prefix}-root-2.mjs'
import './${prefix}-relative-alias.mjs'
export class RegistryError extends UserError {}`]
  ])

  /**
   * @param {string} specifier The module specifier.
   * @param {{ parentURL?: string }} context The resolve context.
   */
  function nextResolve (specifier, context) {
    if (specifier === `${prefix}-alias`) {
      return { url: rootURLs[0], format: 'module', shortCircuit: true }
    }
    if (specifier === `./${prefix}-relative-alias.mjs`) {
      return { url: rootURLs[2], format: 'module', shortCircuit: true }
    }
    return { url: new URL(specifier, context.parentURL).href, format: 'module', shortCircuit: true }
  }

  /**
   * @param {string} url The module URL.
   */
  function nextLoad (url) {
    return { format: 'module', source: sources.get(url), shortCircuit: true }
  }

  return { prefix, rootURLs, consumerURL, nextResolve, nextLoad }
}

/**
 * @param {ReturnType<typeof createHook>} hook The hook under test.
 * @param {ReturnType<typeof createVirtualLoader>} loader The virtual module loader.
 * @param {number} rootIndex The root module index.
 */
async function loadAsyncRoot (hook, loader, rootIndex) {
  const wrapper = await hook.resolve(
    loader.rootURLs[rootIndex],
    { parentURL: `file:///${loader.prefix}-entry.mjs`, conditions },
    loader.nextResolve
  )
  await hook.load(wrapper.url, { format: 'module' }, loader.nextLoad)
}

/**
 * @param {ReturnType<typeof createHook>} hook The hook under test.
 * @param {ReturnType<typeof createVirtualLoader>} loader The virtual module loader.
 */
async function consumeAsyncCycleCandidates (hook, loader) {
  await Promise.all([
    hook.resolve(
      `${loader.prefix}-alias`,
      { parentURL: loader.consumerURL, conditions },
      loader.nextResolve
    ),
    hook.resolve(
      `./${loader.prefix}-root-1.mjs`,
      { parentURL: loader.consumerURL, conditions },
      loader.nextResolve
    ),
    hook.resolve(
      `./${loader.prefix}-root-2.mjs`,
      { parentURL: loader.consumerURL, conditions },
      loader.nextResolve
    ),
    hook.resolve(
      `./${loader.prefix}-relative-alias.mjs`,
      { parentURL: loader.consumerURL, conditions },
      loader.nextResolve
    )
  ])
}

function failResolve () {
  throw missingError
}

const dedupeLoader = createVirtualLoader('dedupe-cycle')
const dedupeHook = createHook(meta)
const dedupeResult = { url: dedupeLoader.rootURLs[0], format: 'module', shortCircuit: true }
function resolveDedupeRoot () {
  return dedupeResult
}
const firstDedupeWrapper = dedupeHook.resolveSync(
  'dedupe-first-alias',
  { parentURL: 'file:///dedupe-first-parent.mjs', conditions },
  resolveDedupeRoot
)
dedupeHook.resolveSync(
  'dedupe-first-alias',
  { parentURL: 'file:///dedupe-first-parent.mjs', conditions },
  resolveDedupeRoot
)
dedupeHook.resolveSync(
  'dedupe-second-alias',
  { parentURL: 'file:///dedupe-second-parent.mjs', conditions },
  resolveDedupeRoot
)
dedupeHook.resolveSync(
  'dedupe-first-alias',
  { parentURL: 'file:///dedupe-first-parent.mjs', conditions },
  resolveDedupeRoot
)
dedupeHook.resolveSync(
  'dedupe-first-alias',
  { parentURL: 'file:///dedupe-first-parent.mjs', conditions },
  resolveDedupeRoot
)
const { source: dedupeSource } = dedupeHook.loadSync(
  firstDedupeWrapper.url,
  { format: 'module' },
  dedupeLoader.nextLoad
)
strictEqual(dedupeSource.includes('dedupe-second-alias'), false)
strictEqual(dedupeSource.includes('dedupe-first-alias'), true)

const retentionChild = spawnSync(process.execPath, [
  '--expose-gc',
  '--max-old-space-size=32',
  fileURLToPath(new URL('../fixtures/cached-resolution-retention.mjs', import.meta.url))
], {
  env: { ...process.env, NODE_OPTIONS: '', NODE_V8_COVERAGE: '' }
})
strictEqual(retentionChild.status, 0, retentionChild.stderr.toString())

const syncLoader = createVirtualLoader('sync-cycle')
const syncHook = createHook(meta)
const firstSyncWrapper = syncHook.resolveSync(
  syncLoader.rootURLs[0],
  { parentURL: 'file:///sync-entry.mjs', conditions },
  syncLoader.nextResolve
)
syncHook.loadSync(firstSyncWrapper.url, { format: 'module' }, syncLoader.nextLoad)
const syncDirectCycle = syncHook.resolveSync(
  './sync-cycle-root-1.mjs',
  { parentURL: syncLoader.consumerURL, conditions },
  syncLoader.nextResolve
)
strictEqual(syncDirectCycle.url, syncLoader.rootURLs[0])
for (const rootURL of syncLoader.rootURLs.slice(1)) {
  const syncWrapper = syncHook.resolveSync(
    rootURL,
    { parentURL: 'file:///sync-entry.mjs', conditions },
    syncLoader.nextResolve
  )
  syncHook.loadSync(syncWrapper.url, { format: 'module' }, syncLoader.nextLoad)
}

const syncCycle = syncHook.resolveSync(
  'sync-cycle-alias',
  { parentURL: syncLoader.consumerURL, conditions },
  syncLoader.nextResolve
)
strictEqual(syncCycle.url, syncLoader.rootURLs[0])
const syncRelativeCycle = syncHook.resolveSync(
  './sync-cycle-relative-alias.mjs',
  { parentURL: syncLoader.consumerURL, conditions },
  syncLoader.nextResolve
)
strictEqual(syncRelativeCycle.url, syncLoader.rootURLs[2])

function resolveSyncMissing () {
  return syncHook.resolveSync(
    './missing.mjs',
    { parentURL: syncLoader.consumerURL, conditions },
    failResolve
  )
}

throws(resolveSyncMissing, { code: 'ERR_MODULE_NOT_FOUND' })
const syncRetry = syncHook.resolveSync(
  'sync-cycle-alias',
  { parentURL: syncLoader.consumerURL, conditions },
  syncLoader.nextResolve
)
strictEqual(new URL(syncRetry.url).searchParams.get('iitm'), 'true')

const nonLeafRootURL = 'file:///non-leaf-root.mjs'
const nonLeafBridgeURL = 'file:///non-leaf-bridge.mjs'
const nonLeafSources = new Map([
  [nonLeafRootURL, "export * from './non-leaf-bridge.mjs'"],
  [nonLeafBridgeURL, "import './non-leaf-root.mjs'; export * from './non-leaf-value.mjs'"],
  ['file:///non-leaf-value.mjs', 'export const value = 1']
])

/**
 * @param {string} specifier The module specifier.
 * @param {{ parentURL?: string }} context The resolve context.
 */
function resolveNonLeaf (specifier, context) {
  return { url: new URL(specifier, context.parentURL).href, format: 'module', shortCircuit: true }
}

/** @param {string} url The module URL. */
function loadNonLeaf (url) {
  return { format: 'module', source: nonLeafSources.get(url), shortCircuit: true }
}

const nonLeafHook = createHook(meta)
const nonLeafWrapper = nonLeafHook.resolveSync(
  nonLeafRootURL,
  { parentURL: 'file:///non-leaf-entry.mjs', conditions },
  resolveNonLeaf
)
nonLeafHook.loadSync(nonLeafWrapper.url, { format: 'module' }, loadNonLeaf)
const nonLeafCycle = nonLeafHook.resolveSync(
  './non-leaf-root.mjs',
  { parentURL: nonLeafBridgeURL, conditions },
  resolveNonLeaf
)
strictEqual(nonLeafCycle.url, nonLeafRootURL)

const duplicateTypeScriptHook = createHook(meta)
const duplicateTypeScriptURL = 'file:///duplicate-typescript.ts'
const duplicateTypeScriptResolve = () => ({
  url: duplicateTypeScriptURL,
  format: 'module-typescript',
  shortCircuit: true
})
duplicateTypeScriptHook.resolveSync(
  './duplicate-typescript.ts',
  { parentURL: 'file:///first-typescript-parent.mjs', conditions },
  duplicateTypeScriptResolve
)
const duplicateTypeScriptWrapper = duplicateTypeScriptHook.resolveSync(
  './duplicate-typescript.ts',
  { parentURL: 'file:///second-typescript-parent.mjs', conditions },
  duplicateTypeScriptResolve
)
duplicateTypeScriptHook.loadSync(duplicateTypeScriptWrapper.url, { format: 'module-typescript' }, () => ({
  format: 'module-typescript',
  source: 'export const value: number = 1',
  shortCircuit: true
}))

const asyncLoader = createVirtualLoader('async-cycle')
const asyncHook = createHook(meta)
const firstAsyncWrapper = await asyncHook.resolve(
  asyncLoader.rootURLs[0],
  { parentURL: 'file:///async-entry.mjs', conditions },
  asyncLoader.nextResolve
)
await asyncHook.load(firstAsyncWrapper.url, { format: 'module' }, asyncLoader.nextLoad)
const asyncDirectCycle = await asyncHook.resolve(
  './async-cycle-root-1.mjs',
  { parentURL: asyncLoader.consumerURL, conditions },
  asyncLoader.nextResolve
)
strictEqual(asyncDirectCycle.url, asyncLoader.rootURLs[0])
for (const rootURL of asyncLoader.rootURLs.slice(1)) {
  const asyncWrapper = await asyncHook.resolve(
    rootURL,
    { parentURL: 'file:///async-entry.mjs', conditions },
    asyncLoader.nextResolve
  )
  await asyncHook.load(asyncWrapper.url, { format: 'module' }, asyncLoader.nextLoad)
}

const asyncCycle = await asyncHook.resolve(
  'async-cycle-alias',
  { parentURL: asyncLoader.consumerURL, conditions },
  asyncLoader.nextResolve
)
strictEqual(asyncCycle.url, asyncLoader.rootURLs[0])
const asyncRelativeCycle = await asyncHook.resolve(
  './async-cycle-relative-alias.mjs',
  { parentURL: asyncLoader.consumerURL, conditions },
  asyncLoader.nextResolve
)
strictEqual(asyncRelativeCycle.url, asyncLoader.rootURLs[2])

await rejects(
  asyncHook.resolve(
    './missing.mjs',
    { parentURL: asyncLoader.consumerURL, conditions },
    failResolve
  ),
  { code: 'ERR_MODULE_NOT_FOUND' }
)
const asyncRetry = await asyncHook.resolve(
  'async-cycle-alias',
  { parentURL: asyncLoader.consumerURL, conditions },
  asyncLoader.nextResolve
)
strictEqual(new URL(asyncRetry.url).searchParams.get('iitm'), 'true')

const missingRaceLoader = createVirtualLoader('async-missing-race')
const missingRaceHook = createHook(meta)
await loadAsyncRoot(missingRaceHook, missingRaceLoader, 0)
const missingRaceSignal = new EventEmitter()
const pendingMissingResolve = missingRaceHook.resolve(
  './missing.mjs',
  { parentURL: missingRaceLoader.consumerURL, conditions },
  () => once(missingRaceSignal, 'resolved')
)
await consumeAsyncCycleCandidates(missingRaceHook, missingRaceLoader)
const missingRaceAssertion = rejects(pendingMissingResolve, { code: 'ERR_MODULE_NOT_FOUND' })
missingRaceSignal.emit('error', missingError)
await missingRaceAssertion

const supersededRaceLoader = createVirtualLoader('async-superseded-race')
const supersededRaceHook = createHook(meta)
await loadAsyncRoot(supersededRaceHook, supersededRaceLoader, 0)
const supersededRaceSignal = new EventEmitter()
const pendingSupersededResolve = supersededRaceHook.resolve(
  './missing.mjs',
  { parentURL: supersededRaceLoader.consumerURL, conditions },
  () => once(supersededRaceSignal, 'resolved')
)
await consumeAsyncCycleCandidates(supersededRaceHook, supersededRaceLoader)
await loadAsyncRoot(supersededRaceHook, supersededRaceLoader, 1)
const supersededRaceAssertion = rejects(pendingSupersededResolve, { code: 'ERR_MODULE_NOT_FOUND' })
supersededRaceSignal.emit('error', missingError)
await supersededRaceAssertion
const supersededCycle = await supersededRaceHook.resolve(
  'async-superseded-race-alias',
  { parentURL: supersededRaceLoader.consumerURL, conditions },
  () => ({ url: supersededRaceLoader.rootURLs[1], format: 'module', shortCircuit: true })
)
strictEqual(supersededCycle.url, supersededRaceLoader.rootURLs[1])

const pendingInstallLoader = createVirtualLoader('async-pending-install')
const pendingInstallHook = createHook(meta)
const pendingInstallSignal = new EventEmitter()
async function waitForPendingInstall () {
  const [result] = await once(pendingInstallSignal, 'resolved')
  return result
}
const pendingInstallResolve = pendingInstallHook.resolve(
  'async-pending-install-alias',
  { parentURL: pendingInstallLoader.consumerURL, conditions },
  waitForPendingInstall
)
await loadAsyncRoot(pendingInstallHook, pendingInstallLoader, 0)
pendingInstallSignal.emit('resolved', {
  url: pendingInstallLoader.rootURLs[0],
  format: 'module',
  shortCircuit: true
})
const pendingInstallCycle = await pendingInstallResolve
strictEqual(pendingInstallCycle.url, pendingInstallLoader.rootURLs[0])
