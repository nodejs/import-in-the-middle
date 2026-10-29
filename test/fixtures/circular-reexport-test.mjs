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
   * @param {string | undefined} baseDir
   * @param {string | undefined} format
   */
  const hook = new Hook((exports, name, baseDir, format) => {
    if (name.endsWith('circular-reexport-barrel.mjs')) {
      strictEqual(format, 'module')
      barrelHooked = true
      exports.value = 2
      if (consumerFirst) exports.UserError = HookedUserError
    }
    if (name.endsWith('circular-reexport-consumer.mjs')) {
      strictEqual(format, 'module')
      consumerHooked = true
    }
  })
  let lateHook
  try {
    let loaded
    if (consumerFirst) {
      const { RegistryError, importCircularExports } = await import('./circular-reexport-consumer.mjs')
      const exports = await importCircularExports()
      loaded = exports
      strictEqual(exports.UserError, HookedUserError)
      strictEqual(RegistryError.prototype instanceof HookedUserError, true)
    } else {
      const { default: exports } = await import('./circular-reexport-entry.mjs')
      loaded = exports
      strictEqual(barrelHooked, true)
      strictEqual(consumerHooked, true)
      strictEqual(exports.RegistryError.prototype instanceof exports.UserError, true)
      strictEqual(exports.sameUserError, true)
    }
    strictEqual(loaded.getNamespace(), loaded)
    strictEqual(loaded.value, 2)
    strictEqual(loaded.readValue(), 2)
    strictEqual(loaded.readNamespaceValue(), 2)
    /**
     * @param {Record<string, unknown>} exports
     * @param {string} name
     * @param {string | undefined} baseDir
     * @param {string | undefined} format
     */
    lateHook = new Hook((exports, name, baseDir, format) => {
      if (name.endsWith('circular-reexport-barrel.mjs')) {
        strictEqual(format, 'module')
        exports.value = 3
      }
    })
    strictEqual(loaded.value, 3)
    strictEqual(loaded.readValue(), 3)
    strictEqual(loaded.readNamespaceValue(), 3)
  } finally {
    lateHook?.unhook()
    hook.unhook()
  }
}
