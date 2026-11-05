import assert from 'node:assert/strict'
import * as module from 'node:module'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

import { supportsSyncHooks } from '../supports-sync-hooks.mjs'

const [directory = process.cwd(), mode = 'active', leavesText = '4000', sharedLeavesText = '0'] = process.argv.slice(2)
const leaves = Number(leavesText)
const sharedLeaves = Number(sharedLeavesText)
assert.ok(supportsSyncHooks(), 'This benchmark requires synchronous loader hooks')
assert.equal(typeof global.gc, 'function', 'Run this benchmark with --expose-gc')
assert.ok(new Set(['active', 'inactive', 'excluded']).has(mode), 'Expected active, inactive or excluded')
assert.ok(Number.isSafeInteger(leaves) && leaves > 0, 'Expected a positive leaf count')
assert.ok(Number.isSafeInteger(sharedLeaves) && sharedLeaves >= 0, 'Expected a non-negative shared leaf count')

const prefix = 'file:///iitm-acyclic-barrels/'
const root = `${prefix}root.mjs`
const helper = `${prefix}helper.mjs`
const sources = new Map()
let helperSource = ''
for (let index = 0; index < sharedLeaves; index++) {
  const url = `${prefix}shared-${index}.mjs`
  sources.set(url, `export const value = ${index}`)
  helperSource += `import '${url}'\n`
}
sources.set(helper, `${helperSource}export const add = value => value + 1`)
let rootSource = ''
for (let first = 0; first < leaves; first += 8) {
  const barrel = `${prefix}barrel-${first}.mjs`
  let source = ''
  for (let index = first; index < Math.min(first + 8, leaves); index++) {
    const leaf = `${prefix}leaf-${index}.mjs`
    sources.set(leaf, `import { add } from '${helper}'; export const value${index} = add(${index})`)
    source += `export * from '${leaf}'\n`
  }
  sources.set(barrel, source)
  rootSource += `import '${barrel}'\n`
}
sources.set(root, `${rootSource}export const value = 42`)
module.registerHooks({
  /**
   * @param {string} specifier
   * @param {import('node:module').ResolveHookContext} context
   * @param {(specifier: string, context?: Partial<import('node:module').ResolveHookContext>) => import('node:module').ResolveFnOutput} nextResolve
   */
  resolve (specifier, context, nextResolve) {
    return sources.has(specifier)
      ? { url: specifier, format: 'module', shortCircuit: true }
      : nextResolve(specifier, context)
  },
  /**
   * @param {string} url
   * @param {import('node:module').LoadHookContext} context
   * @param {(url: string, context?: Partial<import('node:module').LoadHookContext>) => import('node:module').LoadFnOutput} nextLoad
   */
  load (url, context, nextLoad) {
    return sources.has(url)
      ? { source: sources.get(url), format: 'module', shortCircuit: true }
      : nextLoad(url, context)
  }
})

global.gc()
const beforeHeap = process.memoryUsage().heapUsed
const beforeCpu = process.cpuUsage()
const beforeWall = performance.now()
let calls = 0
if (mode === 'active') {
  const { Hook } = await import(pathToFileURL(resolve(directory, 'index.js')))
  Hook(/**
   * @param {{ value: number }} exports
   * @param {string} name
   */ (exports, name) => {
      calls++
      if (name.endsWith('/root.mjs')) exports.value++
    })
}
const { register } = await import(pathToFileURL(resolve(directory, 'register-hooks.mjs')))
register({ include: mode === 'excluded' ? [] : [/^file:\/\/\/iitm-acyclic-barrels\//] })
const loaded = await import(root)
const cpu = process.cpuUsage(beforeCpu)
const wallMs = performance.now() - beforeWall
assert.equal(calls, mode === 'active' ? sources.size : 0)
assert.equal(loaded.value, mode === 'active' ? 43 : 42)
for (let attempt = 0; attempt < 3; attempt++) global.gc()
const heapBytes = process.memoryUsage().heapUsed - beforeHeap
process.stdout.write(`${JSON.stringify({
  node: process.version,
  mode,
  leaves,
  sharedLeaves,
  modules: sources.size,
  wallMs,
  cpuMs: (cpu.user + cpu.system) / 1000,
  heapBytes
})}\n`)
