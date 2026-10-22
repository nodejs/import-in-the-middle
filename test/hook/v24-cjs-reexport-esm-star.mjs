import { strictEqual } from 'node:assert/strict'

import Hook from '../../index.js'

/** @type {Record<string, unknown> | undefined} */
let hookedExports
let hookedFormat

/**
 * @param {Record<string, unknown>} exports The intercepted module exports.
 * @param {string} name The intercepted module name.
 * @param {string | undefined} baseDir The intercepted package directory.
 * @param {string | undefined} format The intercepted module format.
 */
function captureExports (exports, name, baseDir, format) {
  if (name.includes('cjs-reexport-esm-star.js')) {
    hookedExports = exports
    hookedFormat = format
  }
}

const hook = new Hook(captureExports)
const module = await import('../fixtures/cjs-reexport-esm-star.js')

strictEqual(module.nested, 42)
strictEqual(hookedExports?.nested, 42)
strictEqual(hookedFormat, 'commonjs')

hook.unhook()
