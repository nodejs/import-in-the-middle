import { strictEqual } from 'assert'
import Hook, { createAddHookMessageChannel } from '../../index.js'

const { addHookMessagePort, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

// Simulate the loader thread acknowledging included modules.
addHookMessagePort.on('message', () => {
  addHookMessagePort.postMessage('ack')
})

// Use include list to exercise sendModulesToLoader + ack logic.
const hook = new Hook(['fs'], () => {})

await waitForAllMessagesAcknowledged()

// Sanity: the Hook instance should be unhookable.
strictEqual(typeof hook.unhook, 'function')
hook.unhook()

addHookMessagePort.close()
