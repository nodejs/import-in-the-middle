import { strictEqual } from 'node:assert'
import Hook from '../../index.js'

class HookedUserError extends Error {}

const hook = new Hook((exports, name) => {
  if (name.endsWith('circular-reexport-barrel.mjs')) exports.UserError = HookedUserError
})

const { RegistryError, importCircularExports } = await import('../fixtures/circular-reexport-consumer.mjs')
const circularExports = await importCircularExports()

strictEqual(circularExports.UserError, HookedUserError)
strictEqual(RegistryError.prototype instanceof HookedUserError, true)

hook.unhook()
