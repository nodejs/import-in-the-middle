import { resolve as resolvePackage } from './package-specifier.mjs'

export { initialize, load } from './package-specifier.mjs'

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  if (specifier.startsWith('hyphenated-package')) {
    const name = specifier.endsWith('/wrong-package') ? 'other' : 'hyphenated-package'
    const url = new URL(
      `../fixtures/turbopack-virtual/node_modules/${name}/${encodeURIComponent(specifier)}.mjs`,
      import.meta.url
    ).href
    return { url, format: 'module', shortCircuit: true }
  }
  if (specifier === 'outside-0123456789abcdef') {
    const url = new URL('../fixtures/turbopack-virtual/outside.mjs', import.meta.url).href
    return { url, format: 'module', shortCircuit: true }
  }
  return resolvePackage(specifier, context, nextResolve)
}
