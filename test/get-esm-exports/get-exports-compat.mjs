import { deepStrictEqual, strictEqual } from 'assert'

import { getExports } from '../../lib/get-exports.mjs'
import { driveAsync } from '../../lib/io.mjs'

const modules = new Map([
  ['file:///direct.mjs', 'export const direct = 1'],
  ['file:///star.mjs', 'export const direct = 1; export * from "./dependency.mjs"']
])

const io = {
  /**
   * @param {string} url The module URL.
   */
  async load (url) {
    return { source: modules.get(url), format: 'module' }
  }
}

const directExports = await driveAsync(getExports('file:///direct.mjs', { format: 'module' }), io)
strictEqual(directExports instanceof Set, true)
deepStrictEqual([...directExports], ['direct'])

const starExports = await driveAsync(getExports('file:///star.mjs', { format: 'module' }), io)
strictEqual(starExports instanceof Set, true)
deepStrictEqual([...starExports], ['direct', '* from ./dependency.mjs'])
