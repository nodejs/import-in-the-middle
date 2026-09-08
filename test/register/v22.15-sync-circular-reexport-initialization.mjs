import { strictEqual } from 'node:assert'
import Hook from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

register()

let barrelHooked = false
let consumerHooked = false
const hook = new Hook((exports, name) => {
  if (name.endsWith('circular-reexport-barrel.mjs')) barrelHooked = true
  if (name.endsWith('circular-reexport-consumer.mjs')) consumerHooked = true
})

const { default: circularExports } = await import('../fixtures/circular-reexport-entry.mjs')
const { RegistryError, UserError, sameUserError } = circularExports

strictEqual(barrelHooked, true)
strictEqual(consumerHooked, true)
strictEqual(RegistryError.prototype instanceof UserError, true)
strictEqual(sameUserError, true)

hook.unhook()
