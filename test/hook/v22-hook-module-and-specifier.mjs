import { deepStrictEqual } from 'assert'
import { Hook } from '../../index.js'

const hits = []
Hook(['some-external-module', 'some-external-module/sub'], { internals: true }, (exports, name, baseDir, format) => {
  hits.push([name, format])
})

await import('../fixtures/load-external-modules.mjs')

deepStrictEqual(hits, [
  ['some-external-module/sub.mjs', 'module'], // module name match, internals:true
  ['some-external-module/sub', 'module'], // specifier match
  ['some-external-module', 'module'] // module name match, internals:true
])
