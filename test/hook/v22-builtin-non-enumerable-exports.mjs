// node:events exposes kMaxEventTargetListeners and kMaxEventTargetListenersWarned
// as non-enumerable own properties. With Object.keys() these were silently
// dropped from the exports set and would not appear in the IITM shim at all.
// With Object.getOwnPropertyNames() they are included in the shim.
//
// Note: even though Node's ESM namespace doesn't directly expose the Symbol
// values behind these keys, the IITM shim includes them so that they are
// observable (e.g. via the `in` operator) and can be overridden by hooks.

import { ok } from 'assert'
import Hook from '../../index.js'

let capturedExports = null
const hook = new Hook(['events'], (exports, name) => {
  if (name === 'events') {
    capturedExports = exports
  }
})

await import('node:events')

ok(capturedExports !== null, 'Hook should have fired for node:events')

// Verify non-enumerable own properties of the events module's CJS export object
// are present as named exports in the IITM hook namespace.
// These properties are NOT in Object.keys(require('events')) — only in
// Object.getOwnPropertyNames(require('events')).
ok(
  'kMaxEventTargetListeners' in capturedExports,
  'non-enumerable kMaxEventTargetListeners should be present in IITM hook exports'
)
ok(
  'kMaxEventTargetListenersWarned' in capturedExports,
  'non-enumerable kMaxEventTargetListenersWarned should be present in IITM hook exports'
)

// Verify enumerable exports are still present
ok(typeof capturedExports.default === 'function', 'default (EventEmitter) should be present')
ok(typeof capturedExports.EventEmitter === 'function', 'EventEmitter named export should be present')

hook.unhook()
