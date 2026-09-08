import { strictEqual } from 'assert'

import Hook from '../../index.js'

/** @type {Record<string, unknown> | undefined} */
let hookedExports

/**
 * @param {Record<string, unknown>} exports The intercepted module exports.
 * @param {string} name The intercepted module name.
 */
function captureExports (exports, name) {
  if (name.includes('cjs-reexport-esm-star.js')) hookedExports = exports
}

const hook = new Hook(captureExports)
const module = await import('../fixtures/cjs-reexport-esm-star.js')

strictEqual(module.nested, 42)
strictEqual(hookedExports?.nested, 42)

hook.unhook()
