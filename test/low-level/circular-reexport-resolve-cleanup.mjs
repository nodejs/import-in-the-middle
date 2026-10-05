import { rejects, strictEqual, throws } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import { fileURLToPath } from 'node:url'

import { createHook } from '../../create-hook.mjs'

const meta = { url: new URL('../../hook.mjs', import.meta.url).href }
const conditions = ['import']
const missingError = Object.assign(new Error('missing module'), { code: 'ERR_MODULE_NOT_FOUND' })

/**
 * @param {string} prefix
 * @param {boolean} [sync]
 */
function createFixture (prefix, sync = false) {
  const roots = [1, 2, 3].map(/** @param {number} index */ index => `file:///${prefix}-root-${index}.mjs`)
  const consumer = `file:///${prefix}-consumer.mjs`
  const specifiers = [`${prefix}-alias`, `./${prefix}-root-1.mjs`,
    `./${prefix}-root-2.mjs`, `./${prefix}-relative-alias.mjs`]
  const sources = new Map()
  for (const root of roots) {
    sources.set(root, `export * from './${prefix}-error.mjs'; export * from './${prefix}-registry.mjs'`)
  }
  sources.set(`file:///${prefix}-error.mjs`, 'export class UserError extends Error {}')
  sources.set(`file:///${prefix}-registry.mjs`, `export * from './${prefix}-consumer.mjs'`)
  sources.set(consumer, `import { UserError } from '${specifiers[0]}'
import '${specifiers[1]}'
import '${specifiers[2]}'
import '${specifiers[3]}'
export class RegistryError extends UserError {}`)
  const hook = createHook(meta)
  const resolveHook = sync ? hook.resolveSync : hook.resolve
  const loadHook = sync ? hook.loadSync : hook.load
  let consumerLoaded = false

  /**
   * @param {string} specifier
   * @param {{ parentURL?: string }} context
   */
  function nextResolve (specifier, context) {
    const url = specifier === specifiers[0]
      ? roots[0]
      : specifier === specifiers[3] ? roots[2] : new URL(specifier, context.parentURL).href
    return { url, format: 'module', shortCircuit: true }
  }

  /** @param {string} url */
  function nextLoad (url) {
    return { format: 'module', source: sources.get(url), shortCircuit: true }
  }

  /**
   * @param {string} specifier
   * @param {string} [parentURL]
   * @param {Parameters<ReturnType<typeof createHook>['resolve']>[2]} [next]
   */
  function resolve (specifier, parentURL = consumer, next = nextResolve) {
    return resolveHook(specifier, { parentURL, conditions }, next)
  }

  /**
   * @param {string} url
   * @param {Parameters<ReturnType<typeof createHook>['load']>[2]} [next]
   */
  function load (url, next = nextLoad) {
    return loadHook(url, { format: 'module' }, next)
  }

  /** @param {number} index */
  async function loadRoot (index) {
    if (!consumerLoaded) {
      await load(consumer)
      consumerLoaded = true
    }
    const wrapper = await resolve(roots[index], `file:///${prefix}-entry.mjs`)
    await load(wrapper.url)
  }

  async function consumeCandidates () {
    await Promise.all(specifiers.map(/** @param {string} specifier */ specifier => resolve(specifier)))
  }

  return { roots, consumer, specifiers, sources, resolve, load, loadRoot, consumeCandidates, nextResolve }
}

function failResolve () {
  throw missingError
}

/** @param {string} url */
function assertWrapped (url) {
  strictEqual(new URL(url).searchParams.get('iitm'), 'true')
}

{
  const fixture = createFixture('dedupe-cycle', true)
  const result = { url: fixture.roots[0], format: 'module', shortCircuit: true }
  const resolveRoot = () => result
  let wrapper
  for (const index of [1, 1, 2, 1, 1]) {
    wrapper = fixture.resolve(`dedupe-${index}-alias`, `file:///dedupe-${index}-parent.mjs`, resolveRoot)
  }
  const { source } = fixture.load(wrapper.url)
  strictEqual(source.includes('dedupe-2-alias'), false)
  strictEqual(source.includes('dedupe-1-alias'), true)
}

const retentionChild = spawnSync(process.execPath, [
  '--expose-gc', '--max-old-space-size=32',
  fileURLToPath(new URL('../fixtures/cached-resolution-retention.mjs', import.meta.url))
], { env: { ...process.env, NODE_OPTIONS: '', NODE_V8_COVERAGE: '' } })
strictEqual(retentionChild.status, 0, retentionChild.stderr.toString())

for (const sync of [true, false]) {
  const fixture = createFixture(`${sync ? 'sync' : 'async'}-cycle`, sync)
  await fixture.loadRoot(0)
  strictEqual((await fixture.resolve(fixture.specifiers[1])).url, fixture.roots[0])
  for (const index of [1, 2]) await fixture.loadRoot(index)
  strictEqual((await fixture.resolve(fixture.specifiers[0])).url, fixture.roots[0])
  strictEqual((await fixture.resolve(fixture.specifiers[3])).url, fixture.roots[2])
  const resolveMissing = () => fixture.resolve('./missing.mjs', fixture.consumer, failResolve)
  if (sync) throws(resolveMissing, { code: 'ERR_MODULE_NOT_FOUND' })
  else await rejects(resolveMissing, { code: 'ERR_MODULE_NOT_FOUND' })
  assertWrapped((await fixture.resolve(fixture.specifiers[0])).url)
}

{
  const fixture = createFixture('non-leaf', true)
  const [root] = fixture.roots
  fixture.sources.set(root, `export * from '${fixture.consumer}'`)
  fixture.sources.set(fixture.consumer, `import '${root}'; export * from './non-leaf-value.mjs'`)
  fixture.sources.set('file:///non-leaf-value.mjs', 'export const value = 1')
  fixture.load(fixture.consumer)
  const wrapper = fixture.resolve(root, 'file:///non-leaf-entry.mjs')
  fixture.load(wrapper.url)
  strictEqual(fixture.resolve(root).url, root)
}

{
  const hook = createHook(meta)
  const url = 'file:///duplicate-typescript.ts'
  const resolve = () => ({ url, format: 'module-typescript', shortCircuit: true })
  let wrapper
  for (const parentURL of ['file:///first-typescript-parent.mjs', 'file:///second-typescript-parent.mjs']) {
    wrapper = hook.resolveSync('./duplicate-typescript.ts', { parentURL, conditions }, resolve)
  }
  hook.loadSync(wrapper.url, { format: 'module-typescript' }, () => ({
    format: 'module-typescript', source: 'export const value: number = 1', shortCircuit: true
  }))
}

for (const superseded of [false, true]) {
  const fixture = createFixture(`async-${superseded ? 'superseded' : 'missing'}-race`)
  await fixture.loadRoot(0)
  const signal = new EventEmitter()
  const pending = fixture.resolve('./missing.mjs', fixture.consumer, () => once(signal, 'resolved'))
  await fixture.consumeCandidates()
  if (superseded) await fixture.loadRoot(1)
  const assertion = rejects(pending, { code: 'ERR_MODULE_NOT_FOUND' })
  signal.emit('error', missingError)
  await assertion
  if (superseded) {
    const result = await fixture.resolve(fixture.specifiers[0], fixture.consumer,
      () => ({ url: fixture.roots[1], format: 'module', shortCircuit: true }))
    assertWrapped(result.url)
  }
}

{
  const fixture = createFixture('async-pending-install')
  await fixture.load(fixture.consumer)
  const signal = new EventEmitter()
  async function waitForResolve () {
    const [result] = await once(signal, 'resolved')
    return result
  }
  const pending = fixture.resolve(fixture.specifiers[0], fixture.consumer, waitForResolve)
  const wrapper = await fixture.resolve(fixture.roots[0], 'file:///pending-install-entry.mjs')
  await fixture.load(wrapper.url)
  signal.emit('resolved', { url: fixture.roots[0], format: 'module', shortCircuit: true })
  strictEqual((await pending).url, fixture.roots[0])
}

{
  const fixture = createFixture('async-concurrent-load')
  const [existingRoot, root] = fixture.roots
  const existingBackEdge = './async-concurrent-load-root-1.mjs'
  const backEdge = './async-concurrent-load-root-2.mjs'
  for (const url of [existingRoot, root]) fixture.sources.set(url, `export * from '${fixture.consumer}'`)
  fixture.sources.set(fixture.consumer, `import '${existingBackEdge}'; import '${backEdge}'; export const value = 1`)
  const signal = new EventEmitter()
  let pause = false
  /**
   * @param {string} specifier
   * @param {{ parentURL?: string }} context
   */
  async function nextResolve (specifier, context) {
    if (pause && specifier === fixture.consumer) {
      pause = false
      signal.emit('pending')
      await once(signal, 'continue')
    }
    return fixture.nextResolve(specifier, context)
  }
  await fixture.load(fixture.consumer)
  const existingWrapper = await fixture.resolve(existingRoot, 'file:///existing-entry.mjs', nextResolve)
  await fixture.load(existingWrapper.url)
  strictEqual((await fixture.resolve(existingBackEdge)).url, existingRoot)
  const wrapper = await fixture.resolve(root, 'file:///concurrent-entry.mjs', nextResolve)
  pause = true
  const scanPending = once(signal, 'pending')
  const loading = fixture.load(wrapper.url)
  await scanPending
  assertWrapped((await fixture.resolve(backEdge, fixture.consumer, nextResolve)).url)
  signal.emit('continue')
  await loading
  for (const specifier of [backEdge, existingBackEdge]) assertWrapped((await fixture.resolve(specifier)).url)
}

{
  const fixture = createFixture('initiating-only', true)
  const specifier = fixture.specifiers[1]
  fixture.sources.set(fixture.consumer, `import '${specifier}'; export const value = 1`)
  const wrapper = fixture.resolve(specifier)
  fixture.load(wrapper.url)
  assertWrapped(fixture.resolve(specifier).url)
}

{
  const fixture = createFixture('duplicate-load-race')
  const specifiers = [fixture.specifiers[0], fixture.specifiers[1], fixture.specifiers[3]]
  const signal = new EventEmitter()
  let pause = false
  /**
   * @param {string} specifier
   * @param {{ parentURL?: string }} context
   */
  async function nextResolve (specifier, context) {
    if (pause && specifier === 'file:///duplicate-load-race-registry.mjs') {
      pause = false
      signal.emit('pending')
      await once(signal, 'continue')
    }
    return specifiers.includes(specifier)
      ? { url: fixture.roots[0], format: 'module', shortCircuit: true }
      : fixture.nextResolve(specifier, context)
  }
  const [wrapper] = await Promise.all(specifiers.slice(0, 2).map(/** @param {string} specifier */ specifier =>
    fixture.resolve(specifier, fixture.consumer, nextResolve)
  ))
  pause = true
  const loadPending = once(signal, 'pending')
  const loading = fixture.load(wrapper.url)
  await loadPending
  await fixture.resolve(specifiers[2], fixture.consumer, nextResolve)
  signal.emit('continue')
  await loading
  for (const specifier of specifiers) {
    assertWrapped((await fixture.resolve(specifier, fixture.consumer, nextResolve)).url)
  }
}
