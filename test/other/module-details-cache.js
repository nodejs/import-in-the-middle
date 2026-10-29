// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2026 Datadog, Inc.

const { strictEqual } = require('assert')
const { pathToFileURL } = require('url')
const path = require('path')

const detailsPath = require.resolve('module-details-from-path')
const getDetails = require(detailsPath)
let parses = 0
require.cache[detailsPath].exports = filePath => {
  parses++
  return getDetails(filePath)
}

const { Hook } = require('../../index.js')
const { register } = require('../../lib/register.js')
const fixtures = path.resolve(__dirname, '../fixtures/node_modules/some-external-module')
const main = path.join(fixtures, 'index.mjs')
const sub = path.join(fixtures, 'sub.mjs')
const hooks = []
const hits = []

for (let i = 0; i < 100; i++) {
  hooks.push(Hook([i === 0 ? main : `unmatched-${i}`], (_, name) => { hits.push(name) }))
}

// Many Hook instances share a single parse per module load.
register(pathToFileURL(main).href, { namespace: {} }, 'some-external-module', 'module')
strictEqual(parses, 1)
strictEqual(hits.length, 1)
strictEqual(hits[0], main)

// A different module is parsed again rather than reusing the previous details.
register(pathToFileURL(sub).href, { namespace: {} }, 'some-external-module/sub', 'module')
strictEqual(parses, 2)
strictEqual(hits.length, 1)

// A Hook added later replays loaded modules with their own details.
const late = Hook(['some-external-module/sub'], (_, name) => { hits.push(name) })
strictEqual(hits.length, 2)
strictEqual(hits[1], 'some-external-module/sub')

late.unhook()
for (const hook of hooks) hook.unhook()
