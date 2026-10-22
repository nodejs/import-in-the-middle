import { deepStrictEqual } from 'node:assert/strict'

import Hook from '../../index.js'

const names = []
const hook = new Hook(['@scope/some-scoped-module', '@scope/some-scoped-cjs-module'],
  /**
   * @param {import('../../index.js').Namespace} namespace
   * @param {string} name
   */
  (namespace, name) => { names.push(name) })

await import('../fixtures/scoped-package-entry.mjs')
deepStrictEqual(names.sort(), ['@scope/some-scoped-cjs-module', '@scope/some-scoped-module'])
hook.unhook()
