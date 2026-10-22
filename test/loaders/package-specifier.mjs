export function initialize () {
  delete process.env.TURBOPACK
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  if (specifier.startsWith(virtualURL)) {
    return { url: specifier, format: 'module', shortCircuit: true }
  }
  if (specifier === 'root-0123456789abcdef') {
    return { url: new URL('node_modules/root', virtualURL).href, format: 'module', shortCircuit: true }
  }
  if (specifier === '@scope/pkg') {
    return { url: new URL('node_modules/@scope/pkg/plain.mjs', virtualURL).href, format: 'module', shortCircuit: true }
  }
  if (specifier === '@scope/pkg/internal.mjs') {
    return { url: new URL('node_modules/@scope/pkg/internal.mjs', virtualURL).href, format: 'module', shortCircuit: true }
  }
  if (specifier === 'local-0123456789abcdef') {
    return { url: new URL('local.mjs', virtualURL).href, format: 'module', shortCircuit: true }
  }
  if (specifier === '@scope/pkg-0123456789abcdef/subpath.mjs') {
    return { url: new URL('node_modules/@scope/pkg/subpath.mjs', virtualURL).href, format: 'module', shortCircuit: true }
  }
  if (specifier === '@scope/pkg-0123456789abcdef/internal-file.mjs') {
    return {
      url: new URL('node_modules/@scope/pkg/internal-file.mjs', virtualURL).href,
      format: 'module',
      shortCircuit: true
    }
  }
  if (
    specifier === '@scope/pkg-0123456789abcdef' ||
    specifier === 'other-0123456789abcdef' ||
    specifier === 'unmatched-0123456789abcdef'
  ) {
    const name = specifier.slice(0, specifier.lastIndexOf('-'))
    return { url: new URL('node_modules/' + name + '/index.mjs', virtualURL).href, format: 'module', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export function load (url, context, nextLoad) {
  if (url.startsWith(virtualURL)) {
    return {
      source: 'export let value = 1; export function update () { value = 2 }',
      format: 'module',
      shortCircuit: true
    }
  }
  return nextLoad(url, context)
}
const virtualURL = new URL('../fixtures/turbopack-virtual/', import.meta.url).href
