import { createHook } from '../../create-hook.mjs'

const hook = createHook({ url: new URL('../../hook.mjs', import.meta.url).href })
hook.applyOptions({ include: [] })

function preserveEntrypointFormat (result, context) {
  if (!context.parentURL && result.url.endsWith('/entrypoint-esm/main')) {
    return { ...result, format: 'module' }
  }
  return result
}

export async function resolve (specifier, context, nextResolve) {
  // Compose directly because Node 18.5 does not support chaining loader flags.
  return hook.resolve(specifier, context, async (specifier, context) => {
    return preserveEntrypointFormat(await nextResolve(specifier, context), context)
  })
}

export const load = hook.load

export function resolveSync (specifier, context, nextResolve) {
  return preserveEntrypointFormat(nextResolve(specifier, context), context)
}
