// `createWrapperModule` returns a Promise by default and a string with
// `sync: true`. The mode is chosen only by `sync`, never inferred.
import assert from 'node:assert/strict'
import { parse } from 'es-module-lexer'

import { createWrapperModule } from '../../wrapper.mjs'

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

// Same input in all three modes: only `sync: true` returns a string, and every
// mode produces the same code.
const syncCode = createWrapperModule(options(virtualGraph(files), { sync: true }))
assert.equal(typeof syncCode, 'string')

const defaultResult = createWrapperModule(options(virtualGraph(files)))
assert.ok(defaultResult instanceof Promise)
const asyncResult = createWrapperModule(options(virtualGraph(files), { sync: false }))
assert.ok(asyncResult instanceof Promise)

assert.equal(await defaultResult, syncCode)
assert.equal(await asyncResult, syncCode)
assert.match(syncCode, /"fromDep"/)

// Async mode accepts both synchronous adapters and adapters returning Promises.
const promiseGraph = virtualGraph(files, { promises: true })
assert.equal(await createWrapperModule(options(promiseGraph)), syncCode)
assert.ok(promiseGraph.calls.resolve > 0)
assert.ok(promiseGraph.calls.load > 0)

// Promise-returning adapters retain the resolved format when load only
// supplies source, just like synchronous adapters in either execution mode.
{
  const code = await createWrapperModule({
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

// Mode is not inferred from the graph: with no re-exports the adapters are
// never called, yet the default still returns a Promise.
const leafGraph = virtualGraph({})
const leaf = { source: 'export const a = 1\n' }
const leafDefault = createWrapperModule(options(leafGraph, leaf))
assert.ok(leafDefault instanceof Promise)
const leafSync = createWrapperModule(options(leafGraph, { ...leaf, sync: true }))
assert.equal(typeof leafSync, 'string')
assert.equal(await leafDefault, leafSync)
assert.deepEqual(leafGraph.calls, { resolve: 0, load: 0 })

// A boolean chosen at runtime selects the mode.
for (const flag of [true, false]) {
  const result = createWrapperModule(options(virtualGraph(files), { sync: flag }))
  if (flag) {
    assert.equal(result, syncCode)
  } else {
    assert.ok(result instanceof Promise)
    assert.equal(await result, syncCode)
  }
}
