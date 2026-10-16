/**
 * @param {string} url
 * @param {import('node:module').LoadFnOutput} result
 */
function withIgnoredSource (url, result) {
  return result.format === 'builtin'
    ? { ...result, source: url === 'node:fs' ? '' : 'export const fake = true' }
    : result
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export async function load (url, context, nextLoad) {
  return withIgnoredSource(url, await nextLoad(url, context))
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {(url: string, context: import('node:module').LoadHookContext) => import('node:module').LoadFnOutput} nextLoad
 */
export function loadSync (url, context, nextLoad) {
  return withIgnoredSource(url, nextLoad(url, context))
}
