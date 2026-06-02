// when IITM wraps a builtin (e.g. node:events):
//  * IITM hook proxy (capturedExports) exposes 'module.exports' as the real
//    CJS value (e.g. EventEmitter), falling back to $default because the native
//    ESM namespace doesn't expose it. This lets instrumentors intercept/replace
//    the CJS-equivalent export of a builtin.
//
//  * IITM shim's ESM namespace does NOT re-export 'module.exports' as a
//    named export. Native builtins don't have it, so including it would cause
//    check-exports failures (Object.keys mismatches) for any package that wraps
//    a builtin and compares its exports against the unwrapped original.

import { ok, strictEqual } from 'assert'
import Hook from '../../index.js'

let capturedExports = null
const hook = new Hook(['events'], (exports, name) => {
  if (name === 'events') {
    capturedExports = exports
  }
})

const eventsNs = await import('node:events')

ok(capturedExports !== null, 'Hook should have fired for node:events')

// ESM namespace must NOT expose 'module.exports' as a named
// export — native builtins don't have it, so adding it would cause check-exports
// mismatches for packages that compare wrapped vs unwrapped builtin exports.
strictEqual(
  eventsNs['module.exports'],
  undefined,
  "'module.exports' should not be a named export on the IITM shim ESM namespace"
)
ok(
  typeof eventsNs.default === 'function',
  'default export (EventEmitter) should still be present on the ESM namespace'
)

// IITM hook proxy must expose 'module.exports' as the real CJS
// value via the $default fallback, so instrumentors can intercept it.
ok(
  'module.exports' in capturedExports,
  "'module.exports' should be present in IITM hook exports for a builtin"
)

const ModuleExportsValue = capturedExports['module.exports']
ok(
  typeof ModuleExportsValue === 'function',
  "'module.exports' export should be the EventEmitter constructor, not undefined"
)

// Verify it's actually EventEmitter (default export and module.exports are the same thing)
strictEqual(
  ModuleExportsValue,
  capturedExports.default,
  "'module.exports' should be the same as the default export (EventEmitter)"
)

// Verify the exported value works as a constructor
const instance = new ModuleExportsValue()
ok(typeof instance.on === 'function', 'Constructed instance should have EventEmitter methods')

hook.unhook()
