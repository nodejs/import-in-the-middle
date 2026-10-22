import { Hook } from 'import-in-the-middle'
import {
  register,
  supportsSyncHooks,
  type RegisterHooksOptions
} from 'import-in-the-middle/register-hooks.mjs'

const options: RegisterHooksOptions = {
  include: ['included-package', /included/],
  exclude: ['excluded-package', /excluded/],
  disableCjsSourceStripping: true
}

new Hook(() => {})
register()
register(options)
const supported: boolean = supportsSyncHooks()

// @ts-expect-error Include patterns must be strings or regular expressions.
register({ include: [42] })
// @ts-expect-error Exclude patterns must be strings or regular expressions.
register({ exclude: [42] })
// @ts-expect-error Source stripping requires a boolean.
register({ disableCjsSourceStripping: 'true' })
// @ts-expect-error Hook support is a boolean.
const unsupported: number = supportsSyncHooks()

void supported
void unsupported
