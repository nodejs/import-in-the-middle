import { createHook } from '../../create-hook.mjs'

const { resolve } = createHook(import.meta)

export async function resolveHook (specifier, context, nextResolve) {
  if (!context.parentURL) {
    const base = await nextResolve(specifier, context)
    const url = new URL(base.url)
    url.searchParams.set('iitm', 'true')
    const tagged = { ...base, url: url.href }
    const result = await resolve(url.href, context, async () => tagged)
    if (result.format === 'commonjs') {
      throw new Error('entrypoint resolved as commonjs')
    }
    return result
  }
  return resolve(specifier, context, nextResolve)
}

export { resolveHook as resolve }
