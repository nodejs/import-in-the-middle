import { strictEqual } from 'node:assert/strict'
import * as module from 'node:module'

import Hook from '../../index.js'
import { register } from '../../register-hooks.mjs'
import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const prefix = 'file:///sync-circular-graph/'
const roots = [`${prefix}root-a.mjs`, `${prefix}root-b.mjs`]
const shared = `${prefix}shared.mjs`
const terminal = `${prefix}terminal.mjs`
const previous = `${prefix}previous.mjs`
const unrelated = `${prefix}unrelated.mjs`
const loop = `${prefix}loop.mjs`
const sources = new Map([
  [previous, `export * from '${prefix}previous-leaf.mjs'`],
  [`${prefix}previous-leaf.mjs`, `import '${unrelated}'; export const previous = 1`],
  [unrelated, `import '${roots[0]}'; import '${loop}'; export const unused = 1`],
  [loop, `import '${unrelated}'; export const loop = 1`],
  [roots[0], `import '${unrelated}'; export * from '${prefix}leaf-a.mjs'`],
  [roots[1], `export * from '${prefix}leaf-b.mjs'`],
  [`${prefix}leaf-a.mjs`, `import { value } from '${shared}'; export { value }`],
  [`${prefix}leaf-b.mjs`, `import { value } from '${shared}'; export { value }`],
  [shared, 'import { value } from "#terminal"; export { value }'],
  [terminal, 'export const value = 42']
])
let terminalResolutions = 0
const upstream = module.registerHooks({
  /**
   * @param {string} specifier
   * @param {import('node:module').ResolveHookContext} context
   * @param {(specifier: string, context?: Partial<import('node:module').ResolveHookContext>) => import('node:module').ResolveFnOutput} nextResolve
   */
  resolve (specifier, context, nextResolve) {
    if (specifier === '#terminal') {
      terminalResolutions++
      return { url: terminal, format: 'module', shortCircuit: true }
    }
    if (sources.has(specifier)) return { url: specifier, format: 'module', shortCircuit: true }
    return nextResolve(specifier, context)
  },
  /**
   * @param {string} url
   * @param {import('node:module').LoadHookContext} context
   * @param {(url: string, context?: Partial<import('node:module').LoadHookContext>) => import('node:module').LoadFnOutput} nextLoad
   */
  load (url, context, nextLoad) {
    if (sources.has(url)) return { source: sources.get(url), format: 'module', shortCircuit: true }
    return nextLoad(url, context)
  }
})
let calls = 0
const hook = new Hook(/**
 * @param {{ value: number }} exports
 * @param {string} name
 */ (exports, name) => {
    if (name.endsWith('/root-a.mjs') || name.endsWith('/root-b.mjs')) {
      calls++
      exports.value += 10 * calls
    }
  })
register()
let unrelatedBindings = 0
const observer = module.registerHooks({
  /**
   * @param {string} specifier
   * @param {import('node:module').ResolveHookContext} context
   * @param {(specifier: string, context?: Partial<import('node:module').ResolveHookContext>) => import('node:module').ResolveFnOutput} nextResolve
   */
  resolve (specifier, context, nextResolve) {
    if (specifier === `${roots[0]}?iitm=bindings`) unrelatedBindings++
    return nextResolve(specifier, context)
  }
})
try {
  strictEqual((await import(previous)).previous, 1)
  strictEqual((await import(roots[0])).value, 52)
  strictEqual((await import(roots[1])).value, 62)
  strictEqual(unrelatedBindings, 0)
  strictEqual(calls, 2)
  strictEqual(terminalResolutions, 2)
} finally {
  hook.unhook()
  observer.deregister()
  upstream.deregister()
}
