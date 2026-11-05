import { strictEqual } from 'node:assert/strict'
import { once } from 'node:events'

import * as iitm from '../../hook.mjs'

let sources, port, mode, rootURL, leafURL
let leafLoads = 0

/**
 * @param {{ sources: [string, string][], port: import('node:worker_threads').MessagePort, mode: 'race' | 'failure',
 * rootURL: string, leafURL: string }} data
 */
export function initialize (data) {
  sources = new Map(data.sources)
  ;({ port, mode, rootURL, leafURL } = data)
  port.unref()
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  return sources.has(specifier)
    ? { url: specifier, format: 'module', shortCircuit: true }
    : nextResolve(specifier, context)
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export async function load (url, context, nextLoad) {
  if (!sources.has(url)) return nextLoad(url, context)
  if (url === leafURL) {
    leafLoads++
    if (mode === 'race' && leafLoads === 1) {
      port.postMessage('leaf-pending')
      strictEqual((await once(port, 'message'))[0], 'scan-root')
      // A second native import can block the thread that releases this load.
      const wrapper = await iitm.resolve(rootURL, { parentURL: import.meta.url, conditions: ['import'] }, resolve)
      await iitm.load(wrapper.url, { format: 'module' }, load)
      port.postMessage('root-scanned')
      strictEqual((await once(port, 'message'))[0], 'continue')
    } else if (mode === 'failure' && leafLoads >= 2) {
      throw Object.assign(new Error('native leaf load failed'), { code: 'EXPECTED_NATIVE_LOAD_FAILURE' })
    }
  }
  return { source: sources.get(url), format: 'module', shortCircuit: true }
}
