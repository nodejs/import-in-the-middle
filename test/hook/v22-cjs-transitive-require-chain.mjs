// Regression test for ERR_VM_MODULE_LINK_FAILURE when a CJS module loaded
// through an ESM import chain has transitive require() calls.
//
// Scenario (mirrors graphql-koa-dataloader app):
//   ESM app → imports CJS-A (e.g. koa)
//           → CJS-A require()s CJS-B (e.g. is-generator-function)
//           → CJS-B require()s CJS-C (e.g. has-tostringtag)
//
// Without the fix, IITM wraps CJS-C because CJS-B's URL is not in
// cjsInIitmChain. The wrapper introduces `import { register } from '...'`
// which cannot be linked synchronously via ModuleJob.runSync, causing:
//   Error: request for 'file:///.../register.js' is from a module not been linked

import { strictEqual } from 'assert'
import Hook from '../../index.js'

const hooked = []
const hook = new Hook((exports, name) => {
  hooked.push(name)
})

// Import the top-level CJS module. This triggers the full transitive chain:
// cjs-transitive-a → requires cjs-transitive-b → requires cjs-transitive-c
// If cjsInIitmChain propagation is broken, this will throw
// ERR_VM_MODULE_LINK_FAILURE on cjs-transitive-c.
const mod = await import('../fixtures/cjs-transitive-a.js')

strictEqual(mod.default.own, 'top', 'top-level CJS export should be accessible')
strictEqual(mod.default.fromB, 'middle', 'middle CJS export should propagate')
strictEqual(mod.default.fromC, 'deep', 'deep CJS export should propagate')

hook.unhook()
