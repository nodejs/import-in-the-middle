import { strictEqual } from 'node:assert/strict'
import * as module from 'node:module'
import { basename } from 'node:path'

import Hook from '../../index.js'
import * as loader from './preloaded-cycle-loader.mjs'

/** @param {'async' | 'sync'} mode */
export async function testCircularRefresh (mode) {
  const sources = []
  const cases = new Map()
  const endings = [undefined, null, 0, false, 2]
  for (const initial of [1, undefined]) {
    for (const value of endings) {
      for (const override of ['none', 'undefined', '99']) {
        const prefix = `file:///circular-refresh-${mode}-${cases.size}`
        const root = `${prefix}-root.mjs`
        const state = `${prefix}-state.mjs`
        const leaf = `${prefix}-leaf.mjs`
        cases.set(root, { value, override, calls: 0 })
        sources.push(
          [root, `export * from '${state}'; export * from '${leaf}'`],
          [state, `export let value = ${initial}; export function change () { value = ${value} }`],
          [leaf, `import { value } from '${root}'; import { change } from '${state}';
            change(); export function read () { return value }`]
        )
      }
    }
  }
  const roots = [...cases.keys()]
  const emptyRoot = `file:///circular-refresh-${mode}-empty.mjs`
  sources.push([emptyRoot, 'export {}'])
  roots.push(emptyRoot)
  let upstream
  if (mode === 'sync') {
    loader.initialize({ sources })
    upstream = module.registerHooks({ resolve: loader.resolve, load: loader.load })
    const { register } = await import('../../register-hooks.mjs')
    register({ include: roots })
  } else {
    module.register(new URL('./preloaded-cycle-loader.mjs', import.meta.url), { data: { sources } })
    module.register(new URL('../../hook.mjs', import.meta.url), { data: { include: roots } })
  }
  let emptyCalls = 0
  /**
   * @param {Record<string, unknown>} exports
   * @param {string} name
   */
  const hook = new Hook((exports, name) => {
    if (name.endsWith(`circular-refresh-${mode}-empty.mjs`)) {
      exports.value = 99
      emptyCalls++
      return
    }
    const entry = cases.get(`file:///${basename(name)}`)
    if (entry === undefined) return
    entry.calls++
    strictEqual(exports.value, entry.value, name)
    if (entry.override !== 'none') exports.value = entry.override === '99' ? 99 : undefined
  })
  try {
    for (const [root, entry] of cases) {
      const exports = await import(root)
      const expected = entry.override === 'none' ? entry.value : entry.override === '99' ? 99 : undefined
      strictEqual(exports.value, expected, root)
      strictEqual(exports.read(), expected, root)
      strictEqual(entry.calls, 1, root)
      await Promise.resolve()
      strictEqual(exports.value, expected, root)
      strictEqual(exports.read(), expected, root)
    }
    const empty = await import(emptyRoot)
    strictEqual('value' in empty, false)
    strictEqual(emptyCalls, 1)
  } finally {
    hook.unhook()
    upstream?.deregister()
  }
}
