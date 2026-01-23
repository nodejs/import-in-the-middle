import { deepStrictEqual } from 'assert'
import { register } from 'module'
import { Hook } from '../../index.js'

register('../../hook.mjs', import.meta.url)

const hits = []
Hook(['some-external-module', 'some-external-module/sub'], { internals: true }, (exports, name, baseDir) => {
  hits.push(name)
})

await import('../fixtures/load-external-modules.mjs')

deepStrictEqual(hits, [
  'some-external-module/sub.mjs', // module name match, internals:true
  'some-external-module/sub', // specifier match
  'some-external-module/index.mjs' // module name match, internals:true
])
