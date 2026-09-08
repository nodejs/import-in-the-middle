'use strict'

import getEsmExports, { lexEsm, lexEsmWithStaticImports } from '../../lib/get-esm-exports.mjs'
import fs from 'fs'
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const fixturePath = path.join(dirname, '../fixtures/esm-exports.txt')
const fixture = fs.readFileSync(fixturePath, 'utf8')

fixture.split('\n').forEach(line => {
  if (!line.includes(' //| ')) return
  const [mod, testStr] = line.split(' //| ')
  const expectedNames = testStr.split(',').map(x => x.trim())
  if (expectedNames[0] === '') {
    expectedNames.length = 0
  }
  const names = Array.from(getEsmExports(mod))
  assert.deepEqual(expectedNames, names)
  console.log(`${mod}\n  ✅ contains exports: ${testStr}`)
})

assert.deepEqual(Array.from(getEsmExports('export type { Type } from "module-name"')), [])
assert.deepEqual(Array.from(getEsmExports('export type * from "module-name"')), [])
assert.deepEqual(Array.from(getEsmExports('export const alpha: number = 1, beta: string = "two"')), ['alpha', 'beta'])
assert.deepEqual(Array.from(getEsmExports('const type = 1; export { type }')), ['type'])
assert.deepEqual(lexEsm('export const direct = 1; export * from "dependency"', 'file:///parent.mjs'), {
  exportNames: ['direct'],
  starReexports: [{ specifier: 'dependency', parentURL: 'file:///parent.mjs' }],
  hasModuleSyntax: true
})
assert.deepEqual(
  lexEsmWithStaticImports(
    'import value from "dependency"; export * from "star"; export { other } from "named"; export { value }',
    'file:///parent.mjs'
  ),
  {
    exportNames: ['other', 'value'],
    starReexports: [{ specifier: 'star', parentURL: 'file:///parent.mjs' }],
    staticImports: 'dependency',
    hasModuleSyntax: true
  }
)
assert.deepEqual(lexEsmWithStaticImports('export * from "star"', 'file:///parent.mjs'), {
  exportNames: [],
  starReexports: [{ specifier: 'star', parentURL: 'file:///parent.mjs' }],
  staticImports: false,
  hasModuleSyntax: true
})
assert.deepEqual(
  lexEsmWithStaticImports('import type { Type } from "types"; export type { Type }', 'file:///parent.mjs'),
  {
    exportNames: [],
    starReexports: undefined,
    staticImports: false,
    hasModuleSyntax: true
  }
)

// // Generate fixture data
// fixture.split('\n').forEach(line => {
//   if (!line.includes('export ')) {
//     console.log(line)
//     return
//   }
//   const names = getEsmExports(line)
//   console.log(line, '//|', names.join(','))
// })
