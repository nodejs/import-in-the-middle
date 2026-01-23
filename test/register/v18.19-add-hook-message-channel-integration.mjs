import { strictEqual } from 'assert'
import { register } from 'module'
import Hook, { createAddHookMessageChannel } from '../../index.js'

// This is the user-facing flow:
// - create a message channel
// - register the IITM loader with { data, transferList }
// - install a Hook that requests modules to be included
// - wait until the loader acknowledges the message
const { registerOptions, waitForAllMessagesAcknowledged, addHookMessagePort } = createAddHookMessageChannel()

register('../../hook.mjs', import.meta.url, registerOptions)

let called = false
const hook = new Hook(['fs'], () => { called = true })

await waitForAllMessagesAcknowledged()

await import('node:fs')
strictEqual(called, true)

hook.unhook()
addHookMessagePort.close()
