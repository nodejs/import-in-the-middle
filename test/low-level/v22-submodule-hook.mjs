// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { createAddHookMessageChannel, Hook } from '../../index.js'
import { register } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import { deepStrictEqual } from 'assert'

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

Hook(['@scope/some-scoped-module'], (exported) => {
  exported.foo += '-mutated (scoped)'
})
Hook(['@scope/some-scoped-module/sub'], (exported) => {
  exported.bar += '-mutated (scoped sub)'
})

Hook(['@scope/some-scoped-cjs-module'], (exported) => {
  exported.foo += '-mutated (scoped, cjs)'
})
Hook(['@scope/some-scoped-cjs-module/sub'], (exported) => {
  exported.bar += '-mutated (scoped sub, cjs)'
})

Hook(['some-external-module'], (exported) => {
  exported.foo += '-mutated (unscoped)'
})
Hook(['some-external-module/sub'], (exported) => {
  exported.bar += '-mutated (unscoped sub)'
})

Hook(['some-external-cjs-module'], (exported) => {
  exported.foo += '-mutated (unscoped, cjs)'
})
Hook(['some-external-cjs-module/sub'], (exported) => {
  exported.bar += '-mutated (unscoped sub, cjs)'
})

await waitForAllMessagesAcknowledged()

test('loading hooked modules and submodules', async () => {
  const results = await import('../fixtures/load-external-modules.mjs')
  const expect = {
    scoped: 'bar-mutated (scoped)',
    scopedsub: 'baz-mutated (scoped sub)',
    scopedCJS: 'bar-mutated (scoped, cjs)',
    scopedCJSsub: 'baz-mutated (scoped sub, cjs)',
    unscoped: 'bar-mutated (unscoped)',
    unscopedsub: 'baz-mutated (unscoped sub)',
    unscopedCJS: 'bar-mutated (unscoped, cjs)',
    unscopedCJSsub: 'baz-mutated (unscoped sub, cjs)'
  }

  deepStrictEqual(Object.assign({}, results), expect)
})
