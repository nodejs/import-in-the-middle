import assert from 'node:assert/strict'

import { getNodeModuleFormat } from '../../bundler.js'
import { createWrapperModule } from '../../bundler.mjs'

const moduleUrl = new URL('../fixtures/something.mjs', import.meta.url).href

interface WrapperData {
  version: string
  values: readonly ['value']
}

const data: WrapperData = { version: '1.0.0', values: ['value'] as const }
const wrapper = await createWrapperModule({
  module: {
    url: moduleUrl,
    format: 'module',
    source: 'export const value = 42',
    specifier: './something.mjs',
    data,
    passthroughExports: exports => exports.map(({ name }) => name)
  },
  resolve () {
    throw new Error('Unexpected resolve')
  },
  load () {
    throw new Error('Unexpected load')
  }
})

assert.equal(wrapper.sideEffects, true)
assert.equal(wrapper.sourceLineOffset, undefined)
assert.equal(wrapper.imports[0].kind, 'runtime')
assert.equal(getNodeModuleFormat(moduleUrl), 'module')
