import { strictEqual } from 'assert'
import { createAddHookMessageChannel } from '../../index.js'

const { addHookMessagePort, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

// No modules sent => should resolve immediately (covers pendingAckCount === 0 branch).
await waitForAllMessagesAcknowledged()
strictEqual(true, true)

addHookMessagePort.close()
