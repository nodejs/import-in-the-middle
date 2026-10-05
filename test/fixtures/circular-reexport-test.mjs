import { strictEqual } from 'node:assert/strict'

import Hook from '../../index.js'

/** @param {boolean} consumerFirst */
export async function testCircularReexport (consumerFirst) {
  class HookedUserError extends Error {}
  let barrelHooked = false
  let consumerHooked = false
  /**
   * @param {Record<string, unknown>} exports
   * @param {string} name
   */
  const hook = new Hook((exports, name) => {
    if (name.endsWith('circular-reexport-barrel.mjs')) {
      barrelHooked = true
      if (consumerFirst) exports.UserError = HookedUserError
    }
    if (name.endsWith('circular-reexport-consumer.mjs')) consumerHooked = true
  })
  try {
    if (consumerFirst) {
      const { RegistryError, importCircularExports } = await import('./circular-reexport-consumer.mjs')
      const exports = await importCircularExports()
      strictEqual(exports.UserError, HookedUserError)
      strictEqual(RegistryError.prototype instanceof HookedUserError, true)
    } else {
      const { default: exports } = await import('./circular-reexport-entry.mjs')
      strictEqual(barrelHooked, true)
      strictEqual(consumerHooked, true)
      strictEqual(exports.RegistryError.prototype instanceof exports.UserError, true)
      strictEqual(exports.sameUserError, true)
    }
  } finally {
    hook.unhook()
  }
}
