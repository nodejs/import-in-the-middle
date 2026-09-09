import { strictEqual } from 'assert'
import Hook from '../../index.js'

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
