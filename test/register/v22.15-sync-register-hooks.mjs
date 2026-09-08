// Exercises the synchronous `module.registerHooks` integration in-process: the
// generic test loader installs no off-thread loader for `register` test files,
// so the only thing wrapping modules here is `register-hooks.mjs` itself, and
// c8 sees the synchronous resolve/load path run.

import * as nodeModule from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'
import Hook from '../../index.js'
import { ok, rejects, strictEqual } from 'node:assert'

// module.registerHooks accepts the loader's nullish CommonJS source only on
// >= 22.22.3 / >= 24.11.1 / >= 25.1.0 / >= 26; the filename gate only covers the
// major/minor floor, so guard on the real capability at runtime.
if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

// A synchronous upstream loader that returns unparsable source the first time a
// virtual module is read, forcing IITM's wrap to fail, then valid source so the
// fallback can still load it. Registered before IITM so IITM's hooks sit
// outermost and delegate to this one via nextResolve/nextLoad.
const WRAP_FAIL_URL = new URL('file:///virtual/sync-wrap-failure.mjs').href
// A CJS variant: it has no source on disk, so IITM reads it via readFileSync,
// which throws and triggers the wrap failure. The fallback load then returns a
// null source (as Node does for CJS read natively), exercising the
// `result.source == null` fallback branch in loadSync.
const WRAP_FAIL_CJS_URL = new URL('file:///virtual/sync-wrap-failure.cjs').href
const loadCounts = new Map()
nodeModule.registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier === 'virtual-sync-wrap-failure' || specifier === WRAP_FAIL_URL) {
      return { url: WRAP_FAIL_URL, format: 'module', shortCircuit: true }
    }
    if (specifier === 'virtual-sync-wrap-failure-cjs' || specifier === WRAP_FAIL_CJS_URL) {
      return { url: WRAP_FAIL_CJS_URL, format: 'commonjs', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load (url, context, nextLoad) {
    if (url === WRAP_FAIL_URL) {
      const next = (loadCounts.get(url) || 0) + 1
      loadCounts.set(url, next)
      // Un-tokenizable source first (the lexer throws, so IITM wrapping fails),
      // valid JS afterwards (fallback). es-module-lexer tolerates some
      // invalid-but-tokenizable source a full parser rejects, so the failure
      // case has to be genuinely un-tokenizable (unterminated template literal).
      const source = next === 1 ? 'export const ok = `unterminated\n' : 'export const ok = 1\n'
      return { format: 'module', source, shortCircuit: true }
    }
    if (url === WRAP_FAIL_CJS_URL) {
      const next = (loadCounts.get(url) || 0) + 1
      loadCounts.set(url, next)
      // No source while IITM reads it (readFileSync throws -> wrap fails), then
      // a null source on the fallback, then real source so the module loads.
      if (next === 3) return { format: 'commonjs', source: 'module.exports = { ok: 1 }\n', shortCircuit: true }
      return { format: 'commonjs', source: null, shortCircuit: true }
    }
    const result = nextLoad(url, context)
    // Provide source for CJS files (mimicking a transform hook). IITM strips
    // this hook-provided source for CJS modules in its require chain so Node
    // falls back to the native CJS loader (cjsInIitmChain handling in loadSync).
    if (result.format === 'commonjs' && result.source == null && url.includes('cjs-transitive')) {
      result.source = readFileSync(fileURLToPath(url))
    }
    return result
  }
})

// No options: exercises the `if (options)` skip branch in register().
register()

let somethingHooked = false
let collisionHooked = false
let starBuiltinExports
let typescriptCjsExports
let wrapFailureHooked = false

// No module filter: match fixtures by file name, mirroring test/hook/static-import.mjs.
// eslint-disable-next-line no-new
new Hook((exports, name) => {
  if (typeof name === 'string' && /something\.mjs/.test(name)) {
    somethingHooked = true
    exports.foo += 15
  }
  if (typeof name === 'string' && name.endsWith('/export-name-collision.mjs')) {
    collisionHooked = true
    exports['a-b'] = 'wrapped-dashed'
    Reflect.set(exports, '__proto__', 'wrapped-proto')
    exports.a_b = 'wrapped-underscored'
  }
  if (typeof name === 'string' && name.endsWith('/star-builtin.mjs')) {
    starBuiltinExports = exports
  }
  if (typeof name === 'string' && name.endsWith('/typescript-cjs-hook.cts')) {
    typescriptCjsExports = exports
  }
  if (typeof name === 'string' && /sync-wrap-failure/.test(name)) {
    wrapFailureHooked = true
  }
})

// Static imports are hoisted and evaluated before register() runs, so the
// targets have to be imported dynamically after the hook is installed.
const namespace = await import('../fixtures/something.mjs')

ok(somethingHooked, 'sync hook should have run for something.mjs')
strictEqual(namespace.foo, 57, 'hook-mutated named export should be visible through the wrapper')
strictEqual(typeof namespace.default, 'function', 'default export should be preserved')

const collision = await import('../fixtures/export-name-collision.mjs')
ok(collisionHooked, 'sync hook should run for colliding export names')
strictEqual(collision['a-b'], 'wrapped-dashed', 'quoted export should keep an independent wrapper binding')
strictEqual(Reflect.get(collision, '__proto__'), 'wrapped-proto', 'prototype-shaped export should keep its wrapper binding')
strictEqual(collision.a_b, 'wrapped-underscored', 'identifier export should keep an independent wrapper binding')

const starBuiltin = await import('../fixtures/star-builtin.mjs')
strictEqual('module.exports' in starBuiltin, false, 'export star should exclude the builtin default alias')
strictEqual('module.exports' in starBuiltinExports, false, 'hook proxy should exclude the builtin default alias')

const typescriptCjs = await import('../fixtures/typescript-cjs-hook.cts')
strictEqual(typescriptCjs.default.epsilon, 5)
strictEqual(typescriptCjs.default.zeta({ kind: 'square' }), 'square')
ok(typescriptCjsExports, 'sync hook should instrument commonjs-typescript with type-only exports')

// When IITM fails to wrap, it falls back to the upstream loader: the module
// still loads, but it cannot be Hook'ed because it was never wrapped.
// @ts-expect-error - resolved by the in-process loader above
const wrapFail = await import('virtual-sync-wrap-failure')
strictEqual(wrapFail.ok, 1, 'module should still load after a wrap failure')
strictEqual(wrapFailureHooked, false, 'unwrapped module cannot be hooked')

// A CJS module imported through the synchronous ESM chain must have its
// transitive require() calls bypass IITM (cjsInIitmChain), otherwise the
// generated wrapper cannot be linked synchronously (ERR_VM_MODULE_LINK_FAILURE).
const cjs = await import('../fixtures/cjs-transitive-a.js')
strictEqual(cjs.default.own, 'top', 'top-level CJS export should be accessible')
strictEqual(cjs.default.fromB, 'middle', 'middle CJS export should propagate')
strictEqual(cjs.default.fromC, 'deep', 'deep CJS export should propagate')

// A CJS wrap failure whose fallback reports a null source: loadSync re-reads it
// through the parent loader rather than treating it as ESM.
// @ts-expect-error - resolved by the in-process loader above
const wrapFailCjs = await import('virtual-sync-wrap-failure-cjs')
strictEqual(wrapFailCjs.default.ok, 1, 'CJS module should still load after a wrap failure with a null fallback source')

// A star re-export whose target cannot be resolved: IITM yields a RESOLVE op
// that throws, exercising the synchronous loader generator's error handling.
await rejects(
  import('../fixtures/star-export-unresolvable.mjs'),
  /iitm-test-nonexistent-star-target/
)

console.log('✅ module.registerHooks wrapped something.mjs and handled CJS and wrap-failure paths')
