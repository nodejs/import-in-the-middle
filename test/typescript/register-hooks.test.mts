import assert from 'node:assert/strict'

import type { RegisterHooksOptions } from '../../register-hooks.mjs'

type Data = { version: string }

const options: RegisterHooksOptions<Data> = {
  commonjs: true,
  shouldInclude (url) {
    if (!url.startsWith('file:')) return false
    return { data: { version: '1.0.0' } }
  }
}

assert.equal(options.commonjs, true)
