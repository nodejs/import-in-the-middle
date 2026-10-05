const LIVE_URL = 'file:///iitm-capability-live.mjs'
const BAD_URL = 'file:///%'

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  if (specifier === 'virtual-live-capability' || specifier === LIVE_URL) {
    return { url: LIVE_URL, shortCircuit: true }
  }
  if (specifier === 'virtual-bad-capability' || specifier === BAD_URL) {
    return { url: BAD_URL, format: 'module', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export function load (url, context, nextLoad) {
  if (url === LIVE_URL || url === BAD_URL) {
    return {
      format: 'module',
      source: 'export let value = 1; export function update () { value = 2 }',
      shortCircuit: true
    }
  }
  return nextLoad(url, context)
}
