import { rejects, strictEqual } from 'node:assert/strict'
import { once } from 'node:events'
import { register } from 'node:module'
import { MessageChannel, Worker } from 'node:worker_threads'

import Hook from '../../index.js'

/** @param {'race' | 'failure'} mode */
export async function testNativeCycle (mode) {
  const rootURL = `file:///native-cycle-${mode}-root.mjs`
  const leafURL = `file:///native-cycle-${mode}-leaf.mjs`
  const errorURL = `file:///native-cycle-${mode}-error.mjs`
  const sources = [
    [rootURL, `export * from '${errorURL}'; export * from '${leafURL}'`],
    [errorURL, 'export class UserError extends Error {}'],
    [leafURL, `import { UserError } from '${rootURL}'; export class RegistryError extends UserError {}`]
  ]
  const { port1, port2 } = new MessageChannel()
  register(new URL('../fixtures/native-cycle-loader.mjs', import.meta.url), {
    data: { sources, port: port2, mode, rootURL, leafURL },
    transferList: [port2]
  })
  register(new URL('../../hook.mjs', import.meta.url), { data: { include: [rootURL] } })
  let hooked = 0
  const hookCount = mode === 'race' ? new Int32Array(new SharedArrayBuffer(4)) : undefined
  let controller
  /**
   * @param {Record<string, unknown>} exports
   * @param {string} name
   */
  const hook = new Hook((exports, name) => {
    if (name.endsWith(`native-cycle-${mode}-root.mjs`)) {
      hooked++
      if (hookCount !== undefined) Atomics.add(hookCount, 0, 1)
    }
  })
  try {
    if (mode === 'race') {
      // Native linking can block this thread before import() returns its promise.
      controller = new Worker(new URL('./native-cycle-controller.mjs', import.meta.url), {
        workerData: { port: port1, hooked: hookCount },
        transferList: [port1]
      })
      const completed = once(controller, 'exit')
      const [leaf, [exitCode]] = await Promise.all([import(leafURL), completed])
      strictEqual(exitCode, 0)
      strictEqual(hooked, 1)
      const root = await import(rootURL)
      strictEqual(leaf.RegistryError.prototype instanceof root.UserError, true)
      strictEqual(hooked, 1)
    } else {
      await rejects(import(rootURL), { code: 'EXPECTED_NATIVE_LOAD_FAILURE', message: 'native leaf load failed' })
      await rejects(import(rootURL), { code: 'EXPECTED_NATIVE_LOAD_FAILURE', message: 'native leaf load failed' })
      strictEqual(hooked, 0)
    }
  } finally {
    hook.unhook()
    await controller?.terminate()
    port1.close()
  }
}
