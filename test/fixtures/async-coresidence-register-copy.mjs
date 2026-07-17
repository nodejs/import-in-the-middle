import { register } from 'node:module'

const targets = ['events', 'some-external-module', 'some-external-cjs-module']
const mode = process.env.IITM_ASYNC_COPY_MODE
const include = mode === 'include' ? targets : ['some-other-module']

register('./async-coresidence-hook-copy.mjs', import.meta.url, { data: { include } })
