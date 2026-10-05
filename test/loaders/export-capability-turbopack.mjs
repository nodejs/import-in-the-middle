export function initialize () {
  process.env.TURBOPACK = '1'
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  if (specifier.startsWith('file:///virtual/node_modules/')) {
    return { url: specifier, format: 'module', shortCircuit: true }
  }
  if (specifier === '@scope/pkg-hash' || specifier === 'other-hash' || specifier === 'unmatched-hash') {
    const name = specifier.slice(0, specifier.lastIndexOf('-'))
    return { url: 'file:///virtual/node_modules/' + name + '/index.mjs', format: 'module', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export function load (url, context, nextLoad) {
  if (url.startsWith('file:///virtual/node_modules/')) {
    return {
      source: 'export let value = 1; export function update () { value = 2 }',
      format: 'module',
      shortCircuit: true
    }
  }
  return nextLoad(url, context)
}
