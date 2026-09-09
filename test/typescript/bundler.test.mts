import assert from 'node:assert/strict'

import { getNodeModuleFormat, getPackageDetails as getCommonJSPackageDetails } from '../../bundler.js'
import { createWrapperModule, getPackageDetails } from '../../bundler.mjs'

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
assert.equal(getPackageDetails(moduleUrl)?.path, 'something.mjs')
assert.equal(getCommonJSPackageDetails(moduleUrl)?.name, 'test-fixtures')

await createWrapperModule({
  module: {
    url: moduleUrl,
    format: 'commonjs',
    source: 'module.exports = 42',
    specifier: './something.js'
  }
})

if (import.meta.url === '') {
  await createWrapperModule({
    module: {
      url: moduleUrl,
      format: 'commonjs',
      source: '' as string | undefined,
      specifier: './something.js'
    },
    load: () => ({ source: 'module.exports = 42' })
  })

  // @ts-expect-error ESM wrappers require a load adapter.
  await createWrapperModule({
    module: {
      url: moduleUrl,
      format: 'module',
      source: 'export const value = 42',
      specifier: './something.mjs'
    },
    resolve: specifier => ({ url: specifier })
  })

  // @ts-expect-error ESM wrappers require a resolve adapter.
  await createWrapperModule({
    module: {
      url: moduleUrl,
      format: 'module',
      source: 'export const value = 42',
      specifier: './something.mjs'
    },
    load: () => ({ source: 'export const value = 42' })
  })

  // @ts-expect-error CommonJS wrappers without inline source require a load adapter.
  await createWrapperModule({
    module: {
      url: moduleUrl,
      format: 'commonjs',
      specifier: './something.js'
    }
  })
}
