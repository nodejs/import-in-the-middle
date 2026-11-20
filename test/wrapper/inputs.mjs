// Root source may be text or bytes. Adapters are required only for the
// operations export analysis actually performs.
import assert from 'node:assert/strict'
import { parse } from 'es-module-lexer'

import { createWrapperModule, createWrapperModuleSync } from '../../wrapper.mjs'

const rootUrl = 'file:///virtual/inputs/root.mjs'
const depUrl = 'file:///virtual/inputs/dep.mjs'
const base = { url: rootUrl, specifier: './root.mjs' }

/** @param {string} text */
function sources (text) {
  const bytes = new TextEncoder().encode(text)
  const padded = Buffer.concat([Buffer.from('prefix'), bytes, Buffer.from('suffix')])
  return [
    text,
    Buffer.from(bytes),
    bytes,
    bytes.buffer,
    padded.subarray(6, 6 + bytes.length),
    new DataView(padded.buffer, padded.byteOffset + 6, bytes.length)
  ]
}

/** @param {{ code: string }} result */
function exportedNames (result) {
  return parse(result.code)[1].map(({ name }) => name).sort()
}

for (const createWrapper of [createWrapperModuleSync, createWrapperModule]) {
  // Direct exports, named/namespace re-exports and ordinary imports declare
  // their export names without resolving or loading another module.
  for (const [source, names] of [
    ['', []],
    ['export const value = 42; export default 1', ['default', 'value']],
    ["export { value as renamed } from './dep.mjs'", ['renamed']],
    ["export * as namespace from './dep.mjs'", ['namespace']],
    ["import './side-effect.mjs'", []]
  ]) {
    const result = await createWrapper({ ...base, source })
    assert.deepEqual(exportedNames(result), names)
    assert.equal(result.imports[1].format, 'module')
    assert.ok(result.code.includes(`register(${JSON.stringify(rootUrl)}, __binder, "./root.mjs", "module")`))
  }

  // An individually supplied adapter is not called unless it is needed, and
  // an explicit `undefined` counts as omitted.
  for (const adapter of ['resolve', 'load']) {
    await createWrapper({
      ...base,
      source: 'export const value = 42',
      [adapter] () { throw new Error(`unexpected ${adapter}`) }
    })
    await createWrapper({ ...base, source: 'export const value = 42', [adapter]: undefined })
  }

  // Root source may be given in any form load accepts, including empty inputs
  // and views that cover only part of their backing buffer.
  for (const text of ['', "export const café = '你好'\n"]) {
    const expected = await createWrapper({ ...base, source: text })
    for (const source of sources(text)) {
      assert.deepEqual(await createWrapper({ ...base, source }), expected)
    }
  }

  // Resolve alone suffices when every star target is a builtin or the root
  // itself. Neither target needs the caller's load adapter.
  {
    const builtin = await createWrapper({
      ...base,
      source: "export * from 'node:events'",
      resolve: () => ({ url: 'node:events' })
    })
    assert.ok(exportedNames(builtin).includes('EventEmitter'))

    const self = await createWrapper({
      ...base,
      source: "export * from './root.mjs'; export const value = 42",
      resolve: () => ({ url: rootUrl })
    })
    assert.deepEqual(exportedNames(self), ['value'])
  }

  // Byte source stays authoritative even if a cycle reaches the root.
  {
    const loads = []
    const result = await createWrapper({
      ...base,
      source: Buffer.from("export * from './dep.mjs'; export const root = 42"),
      resolve (specifier, { parentURL, kind }) {
        assert.equal(kind, 'import')
        return { url: new URL(specifier, parentURL).href, format: 'module' }
      },
      load (url, context) {
        loads.push(url)
        assert.deepEqual(context, { format: 'module' })
        return { source: "export * from './root.mjs'; export const dep = 1", format: 'module' }
      }
    })
    assert.deepEqual(exportedNames(result), ['dep', 'root'])
    assert.deepEqual(loads, [depUrl])
  }
}
