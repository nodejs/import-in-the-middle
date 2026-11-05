// Error behaviour of `createWrapperModule`: invalid options, adapters that
// break the sync contract, adapter errors and malformed adapter results.
import assert from 'node:assert/strict'

import { createWrapperModule } from '../../wrapper.mjs'

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

// Invalid options. The default (async) mode reports every one of them as a
// rejection, never as a synchronous throw.
const objectCases = {
  'missing url': { ...base, url: undefined },
  'relative url': { ...base, url: './a.mjs' },
  'Buffer source': { ...base, source: Buffer.from('export const a = 1') },
  'missing source': { ...base, source: undefined },
  'non-string specifier': { ...base, specifier: 42 },
  'non-function resolve': { ...base, resolve: {} },
  'non-function load': { ...base, load: 'load' },
  'non-function mapImport': { ...base, mapImport: {} },
  'unknown builtin': { url: 'node:no-such-builtin', specifier: 'no-such-builtin' },
  'builtin with source': { url: 'node:events', specifier: 'events', source: '' },
  'builtin with non-function resolve': { url: 'node:events', specifier: 'events', resolve: {} },
  'builtin with non-string specifier': { url: 'node:events' }
}
const asyncCases = {
  null: null,
  string: 'file:///virtual/errors/root.mjs',
  'non-boolean sync': { ...base, sync: 'yes' },
  ...objectCases
}
for (const [name, options] of Object.entries(asyncCases)) {
  await assertRejectsOnly(() => createWrapperModule(options), TypeError, name)
}

// With `sync: true` the same invalid options throw synchronously.
for (const [name, options] of Object.entries(objectCases)) {
  assert.throws(() => createWrapperModule({ ...options, sync: true }), TypeError, name)
}

// In sync mode an adapter returning a Promise is a synchronous TypeError. The
// Promise is observed, so its later rejection is not reported as unhandled.
const unhandled = []
const onUnhandled = (reason) => unhandled.push(reason)
process.on('unhandledRejection', onUnhandled)

function rejectLater () {
  return new Promise((resolve, reject) => setTimeout(() => reject(new Error('late')), 10))
}

assert.throws(
  () => createWrapperModule({ ...base, sync: true, resolve: rejectLater }),
  (err) => err instanceof TypeError && /resolve\(\)/.test(err.message) && /sync/.test(err.message)
)
assert.throws(
  () => createWrapperModule({ ...base, sync: true, load: rejectLater }),
  (err) => err instanceof TypeError && /load\(\)/.test(err.message) && /sync/.test(err.message)
)
assert.throws(
  () => createWrapperModule({ ...base, sync: true, mapImport: rejectLater }),
  (err) => err instanceof TypeError && /mapImport\(\)/.test(err.message) && /sync/.test(err.message)
)

// `mapImport` is synchronous in async mode too: a Promise rejects the call,
// and is observed as well.
await assert.rejects(
  createWrapperModule({ ...base, mapImport: rejectLater }),
  (err) => err instanceof TypeError && /mapImport\(\)/.test(err.message) && /sync/.test(err.message)
)

await new Promise((resolve) => setTimeout(resolve, 50))
process.off('unhandledRejection', onUnhandled)
assert.deepEqual(unhandled, [])

// An adapter's own error propagates unchanged: thrown in sync mode, rejected
// in async mode.
for (const adapter of ['resolve', 'load']) {
  const error = new Error(`${adapter} failed`)
  assert.throws(
    () => createWrapperModule({ ...base, sync: true, [adapter] () { throw error } }),
    (err) => err === error
  )
  await assert.rejects(
    createWrapperModule({ ...base, [adapter] () { return Promise.reject(error) } }),
    (err) => err === error
  )
}

// Malformed adapter results are TypeErrors in both modes.
const malformed = {
  'resolve returns null': { resolve: () => null },
  'resolve returns no url': { resolve: () => ({}) },
  'resolve returns a relative url': { resolve: () => ({ url: './dep.mjs' }), message: /absolute URL/ },
  'resolve returns a bare builtin name': { resolve: () => ({ url: 'events', format: 'builtin' }), message: /absolute URL/ },
  'load returns null': { load: () => null },
  'load returns no source': { load: () => ({ source: null, format: 'module' }), message: /returned no source/ },
  'load returns a numeric source': { load: () => ({ source: 42 }), message: /string, ArrayBuffer or typed array/ },
  'load returns an object source': { load: () => ({ source: {} }), message: /string, ArrayBuffer or typed array/ },
  'load returns builtin for a non-builtin': {
    load: () => ({ source: null, format: 'builtin' }),
    message: /not a builtin/
  },
  'mapImport returns empty string': { mapImport: () => '' },
  'mapImport returns a number': { mapImport: () => 42 }
}
for (const [name, { message = /./, ...adapters }] of Object.entries(malformed)) {
  const matches = (err) => err instanceof TypeError && message.test(err.message)
  assert.throws(() => createWrapperModule({ ...base, ...adapters, sync: true }), matches, name)
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
assert.throws(() => createWrapperModule({ ...nested, sync: true }), isNestedError)
