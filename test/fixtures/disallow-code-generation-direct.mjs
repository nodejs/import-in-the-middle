import { strictEqual } from 'node:assert'
import getEsmExports from '../../lib/get-esm-exports.mjs'

const exports = getEsmExports(`
  const value = 1
  export { value as "quoted name" }
`)

strictEqual(exports.has('quoted name'), true)
