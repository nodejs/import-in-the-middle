import { strictEqual } from 'node:assert/strict'
import { once } from 'node:events'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { MessageChannel } from 'node:worker_threads'

import Hook from '../../index.js'

const moduleUrl = new URL('../fixtures/export-capability-legacy.mjs', import.meta.url)
const { port1, port2 } = new MessageChannel()
try {
  register(new URL('../../hook.mjs', import.meta.url), import.meta.url, {
    data: { addHookMessagePort: port2 },
    transferList: [port2]
  })
  const acknowledged = once(port1, 'message')
  port1.postMessage([fileURLToPath(moduleUrl)])
  await acknowledged

  let hookCalls = 0
  const hook = new Hook([fileURLToPath(moduleUrl)], namespace => {
    hookCalls++
    namespace.value = 'hooked'
  })
  const namespace = await import(moduleUrl)
  strictEqual(namespace.value, 'hooked')
  strictEqual(hookCalls, 1)
  const live = await import('../fixtures/export-capability-live-consumer.mjs')
  strictEqual(live.Sub.name, 'Sub')
  hook.unhook()
} finally {
  port1.close()
}
