// when IITM wraps a builtin (e.g. node:events), CJS modules
// that call require('node:events') via the require(esm) path (Node 22+) must
// receive a real constructor, not the IITM proxy object.
//
// On Node 24+, when a CJS module is loaded by an IITM shim via loadCJSModule,
// its require() calls for builtins are routed through the ESM resolver. IITM
// tracks such CJS modules in cjsInIitmChain (create-hook.mjs) and bypasses
// wrapping for their require() calls, so require('node:events') returns the
// native EventEmitter rather than the IITM namespace object. Without this
// bypass, the namespace object (Symbol.toStringTag === 'Module') is returned,
// causing:
//   TypeError: Class extends value [object Module] is not a constructor or null

import { strictEqual, ok } from 'assert'
import Hook from '../../index.js'

let hookedEvents = false
const hook = new Hook(['events'], (exports, name) => {
  if (name === 'events') {
    hookedEvents = true
  }
})

// Load node:events via ESM so IITM wraps it. On Node 24+, the CJS fixture
// below is loaded via loadCJSModule inside the IITM shim, so its require()
// calls are routed through the ESM resolver and intercepted by IITM.
await import('node:events')

ok(hookedEvents, 'IITM hook should have fired for node:events')

// Import the CJS fixture that does `class Foo extends require('node:events') {}`.
// If the cjsInIitmChain bypass is missing, this import will throw:
//   TypeError: Class extends value [object Module] is not a constructor or null
const mod = await import('../fixtures/cjs-extends-events.js')
const Foo = mod.default

ok(typeof Foo === 'function', 'Foo should be a constructor function')

// Verify the class actually works — instances should be EventEmitters
const foo = new Foo()
ok(typeof foo.on === 'function', 'instance should inherit EventEmitter.on')
ok(typeof foo.emit === 'function', 'instance should inherit EventEmitter.emit')

// Verify basic EventEmitter behaviour is intact
let received = null
foo.on('test', (v) => { received = v })
foo.emit('test', 42)
strictEqual(received, 42, 'EventEmitter events should work')

hook.unhook()
