import { deepStrictEqual } from 'assert'
import { register } from 'module'
import { Hook } from '../../index.js'

register('../../hook.mjs', import.meta.url)

const hits = []
Hook(['some-external-module', 'some-external-module'], { internals: true }, (exports, name, baseDir) => {
  hits.push(name)
})

await import('../fixtures/load-external-modules.mjs')

// Should get hits for each of the two 'some-external-module' Hook entries.
deepStrictEqual(hits, [
  'some-external-module/sub.mjs',
  'some-external-module/sub.mjs',
  'some-external-module/index.mjs',
  'some-external-module/index.mjs'
])
