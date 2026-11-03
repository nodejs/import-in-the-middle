import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { createRequire, register } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const targets = ['some-external-module', 'some-external-cjs-module']
const modules = []
const hooks = []
const hits = [[], [], []]

const original = dirname(require.resolve('iitm-legacy-v3/package.json'))
const directory = await mkdtemp(fileURLToPath(new URL('../iitm-preloaded-', import.meta.url)))

try {
  await cp(original, join(directory, 'copy'), { recursive: true })
  await checkRegistries()
} finally {
  for (const hook of hooks) hook.unhook()
  await rm(directory, { recursive: true, force: true })
}

async function checkRegistries () {
  for (const [consumer, copy] of [original, join(directory, 'copy')].entries()) {
    const base = pathToFileURL(copy + '/')
    const { Hook } = require(fileURLToPath(new URL('index.js', base)))
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
}
