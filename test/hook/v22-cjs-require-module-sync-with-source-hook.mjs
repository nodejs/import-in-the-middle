// Regression test for ERR_VM_MODULE_LINK_FAILURE when:
// 1. A CJS module is loaded through an ESM import chain
// 2. Another loader hook provides source for CJS modules (like @apm-js-collab/tracing-hooks)
// 3. The CJS module require()s a package with "module-sync" exports condition
//
// On Node 22+, providing source for CJS modules via hooks changes how
// require() works inside those modules. Specifically, require() of packages
// that resolve to ESM files (via module-sync condition) fails because
// ModuleJob.runSync cannot link the ESM file's dependencies.
//
// IITM fixes this by stripping hook-provided source for CJS modules in the
// cjsInIitmChain, forcing Node to use its native CJS loader.

import { strictEqual } from 'assert'
import Hook from '../../index.js'

const hook = new Hook((exports, name) => {
  // Hook all modules
})

// This import triggers the chain:
// ESM (this file) → CJS (cjs-requires-module-sync.js) → module-sync (require.mjs) → CJS (index.js)
// The source-providing-hook (registered via --import) provides source for CJS
// modules. Without the fix, this throws ERR_VM_MODULE_LINK_FAILURE.
const mod = await import('../fixtures/cjs-requires-module-sync.js')

// The result should be accessible (not crash with ERR_VM_MODULE_LINK_FAILURE).
// The actual value depends on whether module-sync condition is used.
const result = mod.default.result
strictEqual(typeof result, 'string', 'require() of module-sync package should succeed')
strictEqual(
  result === 'from-cjs-via-module-sync' || result === 'from-cjs', true,
  `result should be from module-sync or CJS path, got: ${result}`
)

hook.unhook()
