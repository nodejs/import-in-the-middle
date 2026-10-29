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
const cyclicRoots = [`${prefix}cyclic-a.mjs`, `${prefix}cyclic-b.mjs`]
const cyclicShared = `${prefix}cyclic-shared.mjs`
const sources = new Map([
  [previous, `export * from '${prefix}previous-leaf.mjs'`],
  [`${prefix}previous-leaf.mjs`, `import '${unrelated}'; export const previous = 1`],
  [unrelated, `import '${roots[0]}'; import '${loop}'; export const unused = 1`],
  [loop, `import '${unrelated}'; export const loop = 1`],
  [roots[0], `import '${unrelated}'; export * from '${prefix}leaf-a.mjs'`],
  [roots[1], `export * from '${prefix}leaf-b.mjs'`],
  [`${prefix}leaf-a.mjs`, `import { value } from '${shared}'; export { value }`],
  [`${prefix}leaf-b.mjs`, `import { value } from '${shared}'; export { value }`],
  [shared, `import { value } from "#terminal"; import '${prefix}closed-a.mjs'; export { value }`],
  [terminal, 'export const value = 42'],
  [`${prefix}closed-a.mjs`, `import '${prefix}closed-b.mjs'; export const value = 1`],
  [`${prefix}closed-b.mjs`, `import '${prefix}closed-a.mjs'; export const value = 2`],
  [cyclicRoots[0], `export * from '${prefix}cyclic-leaf-a.mjs'`],
  [cyclicRoots[1], `export * from '${prefix}cyclic-leaf-b.mjs'`],
  [`${prefix}cyclic-leaf-a.mjs`, `
    import '${cyclicShared}'
    export function BaseA () {}
    export const value = 1
  `],
  [`${prefix}cyclic-leaf-b.mjs`, `
    import '${cyclicShared}'
    export function BaseB () {}
    export const value = 2
  `],
  [cyclicShared, `
    import { BaseA, value as first } from '${cyclicRoots[0]}'
    import { BaseB, value as second } from '${cyclicRoots[1]}'
    export const bases = () => [BaseA, BaseB]
    export const read = () => [first, second]
  `]
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
    } else if (name.endsWith('/cyclic-a.mjs') || name.endsWith('/cyclic-b.mjs')) {
      exports.value *= 100
    }
  })
register()
let bindingRequests = 0
const observer = module.registerHooks({
  /**
   * @param {string} specifier
   * @param {import('node:module').ResolveHookContext} context
   * @param {(specifier: string, context?: Partial<import('node:module').ResolveHookContext>) => import('node:module').ResolveFnOutput} nextResolve
   */
  resolve (specifier, context, nextResolve) {
    if (specifier.startsWith(prefix) && specifier.includes('?iitm=bindings')) bindingRequests++
    return nextResolve(specifier, context)
  }
})
try {
  const previousExports = await import(previous)
  const first = await import(roots[0])
  const second = await import(roots[1])
  strictEqual(bindingRequests, 0, 'Acyclic barrels must not request cycle binding modules')
  strictEqual(previousExports.previous, 1)
  strictEqual(first.value, 52)
  strictEqual(second.value, 62)
  strictEqual(calls, 2)
  strictEqual(terminalResolutions, 2)
  const cyclicFirst = await import(cyclicRoots[0])
  const cyclicSecond = await import(cyclicRoots[1])
  const { bases, read } = await import(cyclicShared)
  strictEqual(read()[0], 100)
  strictEqual(read()[1], 200)
  strictEqual(bases()[0], cyclicFirst.BaseA)
  strictEqual(bases()[1], cyclicSecond.BaseB)
} finally {
  hook.unhook()
  observer.deregister()
  upstream.deregister()
}
