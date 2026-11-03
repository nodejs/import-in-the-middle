import { strictEqual } from 'node:assert/strict'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'

const worker = new Worker(new URL('./legacy-copy-registry-app.mjs', import.meta.url), {
  execArgv: ['--import', new URL('./legacy-copy-registry-preload.mjs', import.meta.url).href]
})
const [code] = await once(worker, 'exit')
strictEqual(code, 0)
