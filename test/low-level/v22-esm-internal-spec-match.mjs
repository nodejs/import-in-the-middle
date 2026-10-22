// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { createAddHookMessageChannel, Hook } from '../../index.js'
import { register } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve, sep } from 'path'
import { strictEqual, deepStrictEqual } from 'node:assert/strict'

import test from 'node:test'

const {
  registerOptions,
  waitForAllMessagesAcknowledged
} = createAddHookMessageChannel()

const hookModuleURL = String(pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../hook.mjs'
  )
))

register(hookModuleURL, import.meta.url, registerOptions)

let entryCalls = 0
for (const [packageName, extension, suffix] of [
  ['some-external-module', 'mjs', '-mutated'],
  ['some-external-cjs-module', 'js', '-mutated (cjs)'],
  ['@scope/some-scoped-module', 'mjs', '-mutated'],
  ['@scope/some-scoped-cjs-module', 'js', '-mutated (cjs)']
]) {
  Hook([packageName], { internals: true },
    /**
     * @param {{ foo?: string, bar?: string }} exported
     * @param {string} name
     */
    (exported, name) => {
      if (name === packageName) {
        exported.foo += suffix
      } else {
        strictEqual(name, `${packageName}${sep}sub.${extension}`)
        exported.bar += suffix
      }
    })
  Hook([packageName], { internals: false },
    /**
     * @param {object} exported
     * @param {string} name
     */
    (exported, name) => {
      entryCalls++
      strictEqual(name, packageName)
    })
}

await waitForAllMessagesAcknowledged()

test('loading hooked modules and submodules with package internals enabled', async () => {
  const results = await import('../fixtures/load-external-modules.mjs')
  const expect = {
    scoped: 'bar-mutated',
    scopedsub: 'baz-mutated',
    scopedCJS: 'bar-mutated (cjs)',
    scopedCJSsub: 'baz-mutated (cjs)',
    unscoped: 'bar-mutated',
    unscopedsub: 'baz-mutated',
    unscopedCJS: 'bar-mutated (cjs)',
    unscopedCJSsub: 'baz-mutated (cjs)'
  }

  deepStrictEqual(Object.assign({}, results), expect)
  strictEqual(entryCalls, 4)
})
