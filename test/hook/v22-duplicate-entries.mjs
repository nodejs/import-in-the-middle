import { deepStrictEqual } from 'assert'
import { Hook } from '../../index.js'

const hits = []
Hook(['some-external-module', 'some-external-module'], { internals: true }, (exports, name, baseDir) => {
  hits.push(name)
})

await import('../fixtures/load-external-modules.mjs')

// Should get hits for each of the two 'some-external-module' Hook entries.
deepStrictEqual(hits, [
  'some-external-module/sub.mjs',
  'some-external-module/sub.mjs',
  'some-external-module',
  'some-external-module'
])
