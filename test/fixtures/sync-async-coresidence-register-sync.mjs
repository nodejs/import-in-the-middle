import { register } from '../../register-hooks.mjs'

const targets = ['events', 'some-external-module', 'some-external-cjs-module']
const mode = process.env.IITM_SYNC_MODE
const include = mode === 'include' ? targets : ['some-other-module']

register({ include })
