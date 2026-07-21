import { stripTypeScriptTypes } from 'node:module'

const TARGET = '/test/fixtures/typescript-abstract-hook.mts'
const textDecoder = new TextDecoder()

/**
 * @param {import('node:module').ResolveFnOutput} result
 */
function normalizeResolve (result) {
  if (result.format === 'module-typescript' && result.url.includes(TARGET)) {
    return { ...result, format: 'module' }
  }

  return result
}

/**
 * @param {string} url
 * @param {import('node:module').LoadFnOutput} result
 */
function normalizeLoad (url, result) {
  if (
    url.includes(TARGET) &&
    result.source !== null &&
    result.format === 'module'
  ) {
    const source = typeof result.source === 'string'
      ? result.source
      : textDecoder.decode(result.source)
    return {
      ...result,
      source: stripTypeScriptTypes(source, { mode: 'strip' })
    }
  }

  return result
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveFn} nextResolve
 */
export async function resolve (specifier, context, nextResolve) {
  return normalizeResolve(await nextResolve(specifier, context))
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadFn} nextLoad
 */
export async function load (url, context, nextLoad) {
  return normalizeLoad(url, await nextLoad(url, context))
}

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveFn} nextResolve
 */
export function resolveSync (specifier, context, nextResolve) {
  return normalizeResolve(nextResolve(specifier, context))
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {import('node:module').LoadFn} nextLoad
 */
export function loadSync (url, context, nextLoad) {
  return normalizeLoad(url, nextLoad(url, context))
}
