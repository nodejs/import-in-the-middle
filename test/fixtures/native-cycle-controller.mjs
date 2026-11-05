import { strictEqual } from 'node:assert/strict'
import { once } from 'node:events'
import { workerData } from 'node:worker_threads'

const { port, hooked } = workerData
try {
  strictEqual((await once(port, 'message'))[0], 'leaf-pending')
  const rootScanned = once(port, 'message')
  port.postMessage('scan-root')
  strictEqual((await rootScanned)[0], 'root-scanned')
  strictEqual(Atomics.load(hooked, 0), 0)
} finally {
  port.postMessage('continue')
  port.close()
}
