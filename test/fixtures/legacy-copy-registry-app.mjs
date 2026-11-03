import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import { foo as cjsFoo } from 'some-external-cjs-module'
import { foo as esmFoo } from 'some-external-module'

import {
  checkRetention, hits, hooks, installHooks, reloadLegacy, ReplayHook, scenario, subpathHits, subpathHook
} from './legacy-copy-registry-preload.mjs'

if (scenario.late) installHooks()

strictEqual(esmFoo, `bar:${scenario.order.join(':')}`)
strictEqual(cjsFoo, `bar:${scenario.order.join(':')}`)
for (const name of ['some-external-module', 'some-external-cjs-module']) {
  const actual = []
  for (const [consumer, hitName] of hits) {
    if (name === hitName) actual.push(consumer)
  }
  deepStrictEqual(actual, scenario.order)
}

const subpath = await import('some-external-module/sub')
strictEqual(subpath.bar, 'baz:current')
deepStrictEqual(subpathHits, ['some-external-module/sub'])
subpathHook.unhook()

hooks[0].unhook()
const querystring = await import('node:querystring')
strictEqual(querystring.escape('a b'), `a%20b:${scenario.order[1]}`)
deepStrictEqual(hits.at(-1), [scenario.order[1], 'querystring'])
hooks[1].unhook()
const hitCount = hits.length
const events = await import('node:events')
strictEqual(events.getMaxListeners(new events.EventEmitter()), 10)
strictEqual(hits.length, hitCount)

for (const Hook of [ReplayHook, reloadLegacy()]) {
  const replayHits = []
  /**
   * @param {object} namespace
   * @param {string} name
   */
  function onReplay (namespace, name) {
    replayHits.push(name)
  }
  const replay = new Hook(['some-external-module', 'some-external-cjs-module'], onReplay)
  deepStrictEqual(replayHits.sort(), ['some-external-cjs-module', 'some-external-module'])
  replay.unhook()
}

await checkRetention()
