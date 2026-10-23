import { strictEqual } from 'node:assert/strict'
import * as module from 'node:module'

import Hook from '../../index.js'
import * as loader from './preloaded-cycle-loader.mjs'

/** @param {'async' | 'sync'} mode */
export async function testCircularImportPhases (mode) {
  const wasm = 'data:application/wasm;base64,AGFzbQEAAAA='
  const roots = []
  const sources = []
  for (const order of ['source', 'evaluation']) {
    const prefix = `file:///import-phase-${mode}-${order}`
    const root = `${prefix}-root.mjs`
    const leaf = `${prefix}-leaf.mjs`
    const error = `${prefix}-error.mjs`
    roots.push(root)
    const sourceImport = `import source wasmModule from '${wasm}'; import source otherWasmModule from '${wasm}';`
    const evaluationImport = `import * as wasmExports from '${wasm}'; import * as otherWasmExports from '${wasm}';`
    sources.push(
      [root, `export { UserError } from '${error}'; export * from '${leaf}'`],
      [error, 'export class UserError extends Error {}'],
      [leaf, `${order === 'source' ? sourceImport + evaluationImport : evaluationImport + sourceImport}
        import { UserError } from '${root}'; export class RegistryError extends UserError {}
        export const sourceSame = wasmModule === otherWasmModule;
        export const evaluationSame = wasmExports === otherWasmExports;
        export const value = 1; export function read () { return import('${root}') }`]
    )
  }
  if (mode === 'sync') {
    loader.initialize({ sources })
    module.registerHooks({ resolve: loader.resolve, load: loader.load })
    const { register } = await import('../../register-hooks.mjs')
    register({ include: roots })
  } else {
    module.register(new URL('./preloaded-cycle-loader.mjs', import.meta.url), { data: { sources } })
    module.register(new URL('../../hook.mjs', import.meta.url), { data: { include: roots } })
  }
  /** @param {Record<string, unknown>} exports */
  const hook = new Hook(exports => { exports.value = 2 })
  try {
    for (const root of roots) {
      const exports = await import(root)
      strictEqual(exports.sourceSame, true)
      strictEqual(exports.evaluationSame, true)
      strictEqual(new exports.RegistryError() instanceof exports.UserError, true)
      strictEqual((await exports.read()).value, 2)
      strictEqual((await exports.read()).value, 2)
    }
  } finally {
    hook.unhook()
  }
}
