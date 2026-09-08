import Hook from '../../../index.js'
import * as wrapped from './iitm-wrapper.mjs'

/**
 * @returns {{ initialLive: number, live: number, stable: number, hookedLive: number }}
 */
export function runIitmWrapper () {
  let hookedExports
  /** @param {Record<string, unknown>} exports The intercepted exports. */
  function hookExports (exports) {
    hookedExports = exports
    exports.live = 100
    exports.stable = 43
  }

  const hook = new Hook(['iitm-turbopack-live'], hookExports)
  try {
    const initialLive = wrapped.live
    wrapped.increment()
    return {
      initialLive,
      live: wrapped.live,
      stable: wrapped.stable,
      hookedLive: hookedExports.live
    }
  } finally {
    hook.unhook()
  }
}
