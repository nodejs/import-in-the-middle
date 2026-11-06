import { strictEqual } from 'node:assert/strict'

import Hook from '../../index.js'

/** @param {boolean} leafFirst */
export async function testCircularStarInitialization (leafFirst) {
  let hooked = false
  /**
   * @param {Record<string, unknown>} exports
   * @param {string} name
   */
  const hook = new Hook((exports, name) => {
    if (name.endsWith('circular-star-initialization-types.mjs')) {
      exports.overridden = 'hooked-before-ready'
    }
    if (name.endsWith('circular-star-initialization-leaf.mjs')) {
      exports.replaceable = () => 'hooked'
    }
    if (name.endsWith('circular-star-initialization-root.mjs')) {
      strictEqual(typeof exports.value, 'function')
      strictEqual(exports.number, 42)
      strictEqual(exports.missing, undefined)
      strictEqual(exports.overridden, 'hooked-before-ready')
      exports.number = 43
      hooked = true
    }
  })
  try {
    if (leafFirst) await import('./circular-star-initialization-leaf.mjs')
    const root = await import('./circular-star-initialization-root.mjs')
    strictEqual(hooked, true)
    strictEqual(root.number, 43)
    strictEqual(root.value(), 'function')
    strictEqual(root.use(), 'function')
    strictEqual(root.missing, undefined)
    strictEqual(root.overridden, 'hooked-before-ready')
    strictEqual(root.replaceable(), 'hooked')
  } finally {
    hook.unhook()
  }
}
