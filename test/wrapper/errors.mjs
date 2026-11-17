// Error behaviour of `createWrapperModule` and `createWrapperModuleSync`:
// invalid options, adapters that break the sync contract, adapter errors and
// malformed adapter results.
import assert from 'node:assert/strict'

import { createWrapperModule, createWrapperModuleSync } from '../../wrapper.mjs'

const rootUrl = 'file:///virtual/errors/root.mjs'
const depUrl = 'file:///virtual/errors/dep.mjs'

function virtualGraph (files) {
  return {
    resolve (specifier, { parentURL }) {
      return { url: new URL(specifier, parentURL).href }
    },
    load (url) {
      const file = files[url]
      if (file === undefined) throw new Error(`unexpected load of ${url}`)
      return file
    }
  }
}

const graph = virtualGraph({ [depUrl]: { source: 'export const a = 1\n', format: 'module' } })
const base = {
  url: rootUrl,
  source: "export * from './dep.mjs'\n",
  specifier: './root.mjs',
  resolve: graph.resolve,
  load: graph.load
}

// Calls `fn` and asserts it neither throws synchronously nor resolves, but
// rejects with `expected`.
async function assertRejectsOnly (fn, expected, name) {
  let result
  assert.doesNotThrow(() => { result = fn() }, name)
  assert.ok(result instanceof Promise, name)
  await assert.rejects(result, expected, name)
}

// Invalid options. `createWrapperModule` reports every one of them as a
// rejection, never as a synchronous throw.
const objectCases = {
  'missing url': { ...base, url: undefined },
  'relative url': { ...base, url: './a.mjs' },
  'missing source': { ...base, source: undefined },
  'null source': { ...base, source: null },
  'numeric source': { ...base, source: 42 },
  'object source': { ...base, source: {} },
  'non-string specifier': { ...base, specifier: 42 },
  'non-function resolve': { ...base, resolve: {} },
  'non-function load': { ...base, load: 'load' },
  'unknown builtin': { url: 'node:no-such-builtin', specifier: 'no-such-builtin' },
  'builtin with source': { url: 'node:events', specifier: 'events', source: '' },
  'builtin with non-function resolve': { url: 'node:events', specifier: 'events', resolve: {} },
  'builtin with non-string specifier': { url: 'node:events' }
}
const asyncCases = {
  null: null,
  string: 'file:///virtual/errors/root.mjs',
  ...objectCases
}
for (const [name, options] of Object.entries(asyncCases)) {
  await assertRejectsOnly(() => createWrapperModule(options), TypeError, name)
}

// `createWrapperModuleSync` throws the same invalid options synchronously.
for (const [name, options] of Object.entries(asyncCases)) {
  assert.throws(() => createWrapperModuleSync(options), TypeError, name)
}

// Missing adapters are errors only when needed, naming the operation's target
// and the module that re-exports it.
const missingAdapters = [
  {
    options: { ...base, resolve: undefined },
    message: `resolve() is required to analyze './dep.mjs' re-exported by '${rootUrl}'`
  },
  {
    options: { ...base, load: undefined },
    message: `load() is required to analyze '${depUrl}' re-exported by '${rootUrl}'`
  }
]
for (const { options, message } of missingAdapters) {
  const matches = (err) => err instanceof TypeError && err.message.includes(message)
  assert.throws(() => createWrapperModuleSync(options), matches)
  await assertRejectsOnly(() => createWrapperModule(options), matches)
}

// Optional does not mean invalid values are ignored, even for a leaf whose
// export names need neither adapter.
for (const adapter of ['resolve', 'load']) {
  const options = { url: rootUrl, source: 'export const value = 1', specifier: './root.mjs', [adapter]: null }
  const matches = (err) => err instanceof TypeError && err.message.includes(`options.${adapter} must be a function`)
  assert.throws(() => createWrapperModuleSync(options), matches)
  await assertRejectsOnly(() => createWrapperModule(options), matches)
}

// An adapter's own error propagates unchanged: thrown by
// `createWrapperModuleSync`, rejected by `createWrapperModule`.
for (const adapter of ['resolve', 'load']) {
  const error = new Error(`${adapter} failed`)
  assert.throws(
    () => createWrapperModuleSync({ ...base, [adapter] () { throw error } }),
    (err) => err === error
  )
  await assert.rejects(
    createWrapperModule({ ...base, [adapter] () { return Promise.reject(error) } }),
    (err) => err === error
  )
}

// Malformed adapter results are TypeErrors in both functions.
const malformed = {
  'resolve returns null': { resolve: () => null },
  'resolve returns no url': { resolve: () => ({}) },
  'resolve returns a relative url': { resolve: () => ({ url: './dep.mjs' }), message: /absolute URL/ },
  'resolve returns a bare builtin name': { resolve: () => ({ url: 'events', format: 'builtin' }), message: /absolute URL/ },
  'resolve returns builtin for a file url': {
    resolve: () => ({ url: depUrl, format: 'builtin' }),
    message: /resolve builtins to a node: URL/
  },
  'resolve returns an unknown builtin': {
    resolve: () => ({ url: 'node:no-such-builtin' }),
    message: /not a Node.js builtin/
  },
  'resolve returns a non-builtin format for a builtin': {
    resolve: () => ({ url: 'node:events', format: 'module' }),
    message: /for the builtin/
  },
  'load returns null': { load: () => null },
  'load returns no source': { load: () => ({ source: null, format: 'module' }), message: /returned no source/ },
  'load returns a numeric source': { load: () => ({ source: 42 }), message: /string, ArrayBuffer or typed array/ },
  'load returns an object source': { load: () => ({ source: {} }), message: /string, ArrayBuffer or typed array/ },
  'load returns builtin for a non-builtin': {
    load: () => ({ source: null, format: 'builtin' }),
    message: /resolve builtins to a node: URL/
  },
  'resolve returns a numeric format': { resolve: () => ({ url: depUrl, format: 1 }), message: /string format/ },
  'load returns a numeric format': {
    load: () => ({ source: 'export const a = 1\n', format: 1 }),
    message: /string format/
  }
}
for (const [name, { message = /./, ...adapters }] of Object.entries(malformed)) {
  const matches = (err) => err instanceof TypeError && message.test(err.message)
  assert.throws(() => createWrapperModuleSync({ ...base, ...adapters }), matches, name)
  await assert.rejects(createWrapperModule({ ...base, ...adapters }), matches, name)
}

// A failure while analysing a CommonJS re-export target is wrapped in a
// "Failed to parse" error of the re-exporting module, with the original error
// as its `cause`.
const cUrl = 'file:///virtual/errors/c.cjs'
const dUrl = 'file:///virtual/errors/d.cjs'
const nested = {
  ...base,
  source: "export * from './c.cjs'\n",
  ...virtualGraph({
    [cUrl]: { source: "module.exports = require('./d.cjs')\n", format: 'commonjs' },
    [dUrl]: { source: null, format: 'commonjs' }
  })
}
const isNestedError = (err) =>
  err instanceof Error &&
  /Failed to parse/.test(err.message) &&
  err.cause instanceof TypeError &&
  /returned no source/.test(err.cause.message)
await assert.rejects(createWrapperModule(nested), isNestedError)
assert.throws(() => createWrapperModuleSync(nested), isNestedError)
