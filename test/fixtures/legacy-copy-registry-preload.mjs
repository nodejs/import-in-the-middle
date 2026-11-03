import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { once } from 'node:events'
import Module, { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { MessageChannel } from 'node:worker_threads'

const require = createRequire(import.meta.url)
export const scenario = JSON.parse(process.env.IITM_LEGACY_SCENARIO)
export const hits = []
export const hooks = []
export const subpathHits = []
const bases = [new URL('../../', import.meta.url), new URL(scenario.legacy)]
const consumers = []
const targets = ['some-external-module', 'some-external-cjs-module', 'querystring', 'events']
const subpath = 'some-external-module/sub'
let inspectPort
let syncSpecifiers

/** @param {number} consumer */
function installHook (consumer) {
  /**
   * @param {Record<string, string | ((value: string) => string)>} namespace
   * @param {string} name
   */
  function onImport (namespace, name) {
    hits.push([consumer, name])
    if (name === 'querystring' || name === 'events') {
      const method = name === 'querystring' ? 'escape' : 'getMaxListeners'
      const original = namespace[method]
      /** @param {string} value */
      namespace[method] = value => `${original(value)}:${consumer}`
    } else {
      namespace.foo += `:${consumer}`
    }
  }
  hooks.push(new consumers[consumer].Hook(targets, onImport))
}

for (const consumer of scenario.order) {
  const base = bases[consumer]
  const include = scenario.disjoint
    ? consumer === 0 ? [targets[0], targets[2]] : [targets[1], targets[3], subpath]
    : [...targets, subpath]
  consumers[consumer] = require(fileURLToPath(new URL('index.js', base)))
  if (scenario.modes[consumer] === 'sync') {
    if (consumer === 0 && scenario.disjoint) {
      const { createHook } = await import('./inspectable-create-hook.mjs')
      const hook = createHook({ url: new URL('hook.mjs', base).href })
      hook.applyOptions({ include })
      syncSpecifiers = hook.specifiers
      Module.registerHooks({ resolve: hook.resolveSync, load: hook.loadSync })
    } else {
      const { register: registerSync } = await import(new URL('register-hooks.mjs', base))
      registerSync({ include })
    }
  } else {
    const loader = consumer === 0 && scenario.disjoint ? 'test/loaders/specifiers-map-cleanup-loader.mjs' : 'hook.mjs'
    if (consumer === 0 && scenario.disjoint) {
      const { port1, port2 } = new MessageChannel()
      inspectPort = port1
      register(new URL(loader, base), { data: { include, inspectPort: port2 }, transferList: [port2] })
    } else {
      register(new URL(loader, base), { data: { include } })
    }
  }
  if (!scenario.late) installHook(consumer)
  if (scenario.warm && consumer === scenario.order[0]) {
    const { foo } = await import('some-external-module')
    deepStrictEqual(foo, `bar:${consumer}`)
  }
}

/**
 * @param {{ bar: string }} namespace
 * @param {string} name
 */
function onSubpath (namespace, name) {
  namespace.bar += ':current'
  subpathHits.push(name)
}
export const subpathHook = new consumers[0].Hook([subpath], onSubpath)

export const ReplayHook = consumers[0].Hook

export async function checkRetention () {
  if (syncSpecifiers !== undefined) strictEqual(syncSpecifiers.size, 0)
  if (inspectPort === undefined) return
  const response = once(inspectPort, 'message')
  inspectPort.postMessage('size')
  const [size] = await response
  inspectPort.close()
  strictEqual(size, 0, 'the current loader must release specifiers consumed by a legacy loader')
}

export function reloadLegacy () {
  const entry = fileURLToPath(new URL('index.js', bases[1]))
  const register = fileURLToPath(new URL('lib/register.js', bases[1]))
  delete require.cache[entry]
  delete require.cache[register]
  return require(entry).Hook
}

export function installHooks () {
  for (const consumer of scenario.order) installHook(consumer)
}
