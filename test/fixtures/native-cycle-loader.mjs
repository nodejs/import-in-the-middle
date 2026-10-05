import { once } from 'node:events'

let sources, port, mode, rootURL, leafURL
let leafLoads = 0
let rootLoads = 0

/**
 * @param {{ sources: [string, string][], port: import('node:worker_threads').MessagePort, mode: string,
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
  if (url === rootURL && ++rootLoads === 2) port.postMessage('root-loaded')
  if (url === leafURL) {
    leafLoads++
    if (mode === 'race' && leafLoads === 1) {
      port.postMessage('leaf-pending')
      await once(port, 'message')
    } else if (mode === 'failure' && leafLoads >= 2) {
      throw Object.assign(new Error('native leaf load failed'), { code: 'EXPECTED_NATIVE_LOAD_FAILURE' })
    }
  }
  return { source: sources.get(url), format: 'module', shortCircuit: true }
}
