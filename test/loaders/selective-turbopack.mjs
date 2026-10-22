import { resolve as resolvePackage } from './package-specifier.mjs'

export { initialize, load } from './package-specifier.mjs'

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  if (specifier === 'outside-0123456789abcdef') {
    const url = new URL('../fixtures/turbopack-virtual/outside.mjs', import.meta.url).href
    return { url, format: 'module', shortCircuit: true }
  }
  return resolvePackage(specifier, context, nextResolve)
}
