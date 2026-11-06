let sources

/** @param {{ sources: [string, string][] }} data */
export function initialize (data) {
  sources = new Map(data.sources)
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveHook} nextResolve
 */
export function resolve (specifier, context, nextResolve) {
  const url = specifier.startsWith('./late-cycle-') ? new URL(specifier, context.parentURL).href : specifier
  return sources.has(url) ? { url, format: 'module', shortCircuit: true } : nextResolve(specifier, context)
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadHook} nextLoad
 */
export function load (url, context, nextLoad) {
  if (sources.has(url)) return { source: sources.get(url), format: 'module', shortCircuit: true }
  return nextLoad(url, context)
}
