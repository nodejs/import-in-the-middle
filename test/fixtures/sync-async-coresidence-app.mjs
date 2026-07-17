import { deepStrictEqual, strictEqual } from 'node:assert'
import { EventEmitter } from 'node:events'

import { foo as cjsFoo } from 'some-external-cjs-module'
import { foo as esmFoo } from 'some-external-module'

import { hits } from './sync-async-coresidence-state.mjs'

if (process.env.IITM_EXPECT_HIT === '1') {
  strictEqual(hits.length, 3)
  const names = new Set()
  for (const hit of hits) {
    names.add(hit.name)
    if (hit.name === 'events') {
      strictEqual(hit.baseDir, undefined)
    } else {
      strictEqual(hit.baseDir, hit.name)
    }
  }
  deepStrictEqual(names, new Set([
    'events',
    'some-external-cjs-module',
    'some-external-module'
  ]))
  strictEqual(typeof EventEmitter, 'function')
  strictEqual(cjsFoo, 'instrumented:some-external-cjs-module')
  strictEqual(esmFoo, 'instrumented:some-external-module')
} else {
  deepStrictEqual(hits, [])
  strictEqual(typeof EventEmitter, 'function')
  strictEqual(cjsFoo, 'bar')
  strictEqual(esmFoo, 'bar')
}
