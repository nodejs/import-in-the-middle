import { strictEqual } from 'node:assert'
import Hook from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

register()

class HookedUserError extends Error {}

const hook = new Hook((exports, name) => {
  if (name.endsWith('circular-reexport-barrel.mjs')) exports.UserError = HookedUserError
})

const { RegistryError, importCircularExports } = await import('../fixtures/circular-reexport-consumer.mjs')
const circularExports = await importCircularExports()

strictEqual(circularExports.UserError, HookedUserError)
strictEqual(RegistryError.prototype instanceof HookedUserError, true)

hook.unhook()
