import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const targets = ['some-external-module', 'some-external-cjs-module']
const modules = []
const hooks = []
const hits = [[], [], []]

for (const [consumer, legacy] of ['iitm-legacy-v1', 'iitm-legacy-v2'].entries()) {
  const { Hook } = require(legacy)
  const base = pathToFileURL(dirname(require.resolve(`${legacy}/package.json`)) + '/')
  register(new URL('hook.mjs', base), { data: { include: [targets[consumer]] } })
  hooks.push(new Hook(targets,
    /**
     * @param {{ foo: string }} namespace
     * @param {string} name
     */
    (namespace, name) => {
      namespace.foo += `:${consumer}`
      hits[consumer].push(name)
    }))
  modules.push(await import(targets[consumer]))
  strictEqual(modules[consumer].foo, `bar:${consumer}`)
}

const { Hook } = require('../../index.js')
hooks.push(new Hook(targets,
  /**
   * @param {{ foo: string }} namespace
   * @param {string} name
   */
  (namespace, name) => {
    namespace.foo += ':2'
    hits[2].push(name)
  }))

strictEqual(modules[0].foo, 'bar:0:1:2')
strictEqual(modules[1].foo, 'bar:1:0:2')
for (const names of hits) deepStrictEqual(names.sort(), [...targets].sort())
for (const hook of hooks) hook.unhook()
