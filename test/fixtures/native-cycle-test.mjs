import { rejects, strictEqual } from 'node:assert/strict'
import { once } from 'node:events'
import { register } from 'node:module'
import { MessageChannel } from 'node:worker_threads'

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
  /**
   * @param {Record<string, unknown>} exports
   * @param {string} name
   */
  const hook = new Hook((exports, name) => {
    if (name.endsWith(`native-cycle-${mode}-root.mjs`)) hooked++
  })
  try {
    if (mode === 'race') {
      const leafPending = once(port1, 'message')
      const leafImport = import(leafURL)
      strictEqual((await leafPending)[0], 'leaf-pending')
      const rootLoaded = once(port1, 'message')
      const rootImport = import(rootURL)
      const completed = Promise.all([leafImport, rootImport])
      strictEqual((await rootLoaded)[0], 'root-loaded')
      port1.postMessage('continue')
      const [leaf, root] = await completed
      strictEqual(leaf.RegistryError.prototype instanceof root.UserError, true)
      strictEqual(hooked, 1)
    } else {
      await rejects(import(rootURL), { code: 'EXPECTED_NATIVE_LOAD_FAILURE', message: 'native leaf load failed' })
      await rejects(import(rootURL), { code: 'EXPECTED_NATIVE_LOAD_FAILURE', message: 'native leaf load failed' })
      strictEqual(hooked, 0)
    }
  } finally {
    hook.unhook()
    port1.close()
  }
}
