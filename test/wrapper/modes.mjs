// `createWrapperModule` always returns a Promise and accepts adapters that
// return values or Promises. `createWrapperModuleSync` returns the result
// directly and requires synchronous adapters. Both produce the same result.
import assert from 'node:assert/strict'
import { parse } from 'es-module-lexer'

import { createWrapperModule, createWrapperModuleSync } from '../../wrapper.mjs'

const rootUrl = 'file:///virtual/modes/root.mjs'
const depUrl = 'file:///virtual/modes/dep.mjs'
const rootSource = "export * from './dep.mjs'\nexport const own = 1\nexport default 2\n"
const files = {
  [depUrl]: { source: 'export const fromDep = 1\n', format: 'module' }
}

function virtualGraph (files, { promises = false } = {}) {
  const calls = { resolve: 0, load: 0 }
  return {
    calls,
    resolve (specifier, { parentURL }) {
      calls.resolve++
      const url = new URL(specifier, parentURL).href
      const result = { url, format: files[url]?.format }
      return promises ? Promise.resolve(result) : result
    },
    load (url) {
      calls.load++
      const file = files[url]
      if (file === undefined) throw new Error(`unexpected load of ${url}`)
      const result = { source: file.source, format: file.format }
      return promises ? Promise.resolve(result) : result
    }
  }
}

function options (graph, extra) {
  return { url: rootUrl, source: rootSource, specifier: './root.mjs', resolve: graph.resolve, load: graph.load, ...extra }
}

function isResult (value) {
  return value !== null && typeof value === 'object' && !(value instanceof Promise) &&
    typeof value.code === 'string' && Array.isArray(value.imports)
}

// Same input to both functions: only `createWrapperModuleSync` returns the
// result directly, and both produce the same result.
const syncResult = createWrapperModuleSync(options(virtualGraph(files)))
assert.ok(isResult(syncResult))
assert.deepEqual(Object.keys(syncResult).sort(), ['code', 'imports'])

const asyncResult = createWrapperModule(options(virtualGraph(files)))
assert.ok(asyncResult instanceof Promise)
assert.deepEqual(await asyncResult, syncResult)
assert.match(syncResult.code, /"fromDep"/)

// `createWrapperModule` accepts both synchronous adapters and adapters
// returning Promises.
const syncGraph = virtualGraph(files)
assert.deepEqual(await createWrapperModule(options(syncGraph)), syncResult)
assert.ok(syncGraph.calls.resolve > 0)
assert.ok(syncGraph.calls.load > 0)
const promiseGraph = virtualGraph(files, { promises: true })
assert.deepEqual(await createWrapperModule(options(promiseGraph)), syncResult)
assert.deepEqual(promiseGraph.calls, syncGraph.calls)

// Promise-returning adapters retain the resolved format when load only
// supplies source, just like synchronous adapters.
{
  const { code } = await createWrapperModule({
    ...options(virtualGraph({})),
    source: "export * from './dep.mjs'\n",
    async resolve () { return { url: depUrl, format: 'module' } },
    async load (url, { format }) {
      assert.equal(url, depUrl)
      assert.equal(format, 'module')
      return { source: 'const exports = {}; exports.notAnExport = 1\n' }
    }
  })
  assert.deepEqual(parse(code)[1], [])
}

// With no re-exports the adapters are never called, yet `createWrapperModule`
// still returns a Promise.
const leafGraph = virtualGraph({})
const leaf = { source: 'export const a = 1\n' }
const leafAsync = createWrapperModule(options(leafGraph, leaf))
assert.ok(leafAsync instanceof Promise)
const leafSync = createWrapperModuleSync(options(leafGraph, leaf))
assert.ok(isResult(leafSync))
assert.deepEqual(await leafAsync, leafSync)
assert.deepEqual(leafGraph.calls, { resolve: 0, load: 0 })
