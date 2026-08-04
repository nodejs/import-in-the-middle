import assert from 'node:assert/strict'

import { createWrapperModule } from '../../bundler.mjs'

const moduleUrl = new URL('../fixtures/something.mjs', import.meta.url).href
const target = { namespace: 'file', path: moduleUrl }
const wrapper = await createWrapperModule({
  module: {
    url: moduleUrl,
    format: 'module',
    source: 'export const value = 42',
    specifier: './something.mjs',
    target,
    data: { version: '1.0.0' }
  },
  resolve () {
    throw new Error('Unexpected resolve')
  },
  load () {
    throw new Error('Unexpected load')
  }
})

assert.equal(wrapper.sideEffects, true)
assert.equal(wrapper.format, 'module')
assert.equal(wrapper.imports[0].kind, 'runtime')
assert.equal(wrapper.imports[1].target, target)
