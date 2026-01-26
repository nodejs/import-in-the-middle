// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { createAddHookMessageChannel, Hook } from '../../index.js'
import { register } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import { equal, deepStrictEqual } from 'assert'

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

Hook(['some-external-module'], { internals: true }, (exported, name) => {
  equal(name, 'some-external-module')
  exported.foo += '-mutated'
})

Hook(['some-external-cjs-module'], { internals: true }, (exported, name) => {
  equal(name, 'some-external-cjs-module')
  exported.foo += '-mutated (cjs)'
})

Hook(['@scope/some-scoped-module'], { internals: true }, (exported, name) => {
  equal(name, '@scope/some-scoped-module')
  exported.foo += '-mutated'
})

Hook(['@scope/some-scoped-cjs-module'], { internals: true }, (exported, name) => {
  equal(name, '@scope/some-scoped-cjs-module')
  exported.foo += '-mutated (cjs)'
})

Hook(['some-external-module'], { internals: false }, (_, name) => {
  equal(name, 'some-external-module')
})

Hook(['some-external-cjs-module'], { internals: false }, (_, name) => {
  equal(name, 'some-external-cjs-module')
})

Hook(['@scope/some-scoped-module'], { internals: false }, (_, name) => {
  equal(name, '@scope/some-scoped-module')
})

Hook(['@scope/some-scoped-cjs-module'], { internals: false }, (_, name) => {
  equal(name, '@scope/some-scoped-cjs-module')
})

await waitForAllMessagesAcknowledged()

test('loading hooked modules and submodules', async () => {
  const results = await import('../fixtures/load-external-modules.mjs')
  const expect = {
    scoped: 'bar-mutated',
    scopedsub: 'baz',
    scopedCJS: 'bar-mutated (cjs)',
    scopedCJSsub: 'baz',
    unscoped: 'bar-mutated',
    unscopedsub: 'baz',
    unscopedCJS: 'bar-mutated (cjs)',
    unscopedCJSsub: 'baz'
  }

  deepStrictEqual(Object.assign({}, results), expect)
})
