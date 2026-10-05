import { strictEqual } from 'node:assert/strict'
import * as module from 'node:module'

import Hook from '../../index.js'
import * as loader from './preloaded-cycle-loader.mjs'

/**
 * @typedef {object} Cycle
 * @property {string} root
 * @property {string} otherRoot
 * @property {string} leaf
 */

/** @param {'async' | 'sync'} mode */
export async function testPreloadedCycle (mode) {
  const cases = ['full', 'partial'].map(/** @param {string} name */ name => {
    const prefix = `file:///late-cycle-${mode}-${name}`
    return { root: `${prefix}-root.mjs`, otherRoot: `${prefix}-other-root.mjs`, leaf: `${prefix}-leaf.mjs` }
  })
  const sources = cases.flatMap(/** @param {Cycle} cycle */ ({ root, otherRoot, leaf }) => [
    [root, `export * from '${leaf}'`],
    [otherRoot, `export * from '${leaf}'`],
    [leaf, `import '${root}'; export const value = 1; export function read () { return import('${root}') }`]
  ])
  if (mode === 'sync') {
    loader.initialize({ sources })
    module.registerHooks({ resolve: loader.resolve, load: loader.load })
  } else {
    module.register(new URL('./preloaded-cycle-loader.mjs', import.meta.url), { data: { sources } })
  }

  const originals = await Promise.all(cases.map(/** @param {Cycle} cycle */ ({ root }) => import(root)))
  const include = cases.flatMap(/** @param {Cycle} cycle */ ({ root, otherRoot }) => [root, otherRoot])
  if (mode === 'sync') {
    const { register } = await import('../../register-hooks.mjs')
    register({ include })
  } else {
    module.register(new URL('../../hook.mjs', import.meta.url), { data: { include } })
  }
  /** @param {Record<string, unknown>} exports */
  const hook = new Hook(exports => { exports.value = 2 })
  try {
    for (const [index, { root, otherRoot }] of cases.entries()) {
      if (index === 1) strictEqual((await import(otherRoot)).value, 2)
      strictEqual((await import(root)).value, 2)
      strictEqual((await originals[index].read()).value, 2)
      strictEqual((await originals[index].read()).value, 2)
    }
  } finally {
    hook.unhook()
  }
}
