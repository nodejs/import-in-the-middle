import { strictEqual } from 'node:assert/strict'
import { once } from 'node:events'

import { createHook } from '../../create-hook.mjs'

const meta = { url: new URL('../../hook.mjs', import.meta.url).href }
const variants = [
  /** @param {string} source */
  source => source,
  /** @param {string} source */
  source => Buffer.from(source),
  /** @param {string} source */
  source => new TextEncoder().encode(source),
  /** @param {string} source */
  source => new TextEncoder().encode(source).buffer
]

for (const [index, encode] of variants.entries()) {
  for (const mode of ['async', 'sync']) {
    const prefix = `file:///native-static-${mode}-${index}`
    const root = `${prefix}-root.mjs`
    const leaf = `${prefix}-leaf.mjs`
    const hook = createHook(meta)
    /**
     * @param {string} url
     * @param {import('node:module').ResolveHookContext} context
     */
    const resolve = (url, context) => ({ url: new URL(url, context.parentURL).href, format: 'module' })
    /** @param {string} url */
    const load = url => ({
      format: 'module',
      source: encode(url === root ? `export * from '${leaf}'` : `import '${root}'; export const value = 1`)
    })
    const resolveHook = mode === 'sync' ? hook.resolveSync : hook.resolve
    const loadHook = mode === 'sync' ? hook.loadSync : hook.load
    const wrapper = await resolveHook(root, { parentURL: 'file:///native-entry.mjs' }, resolve)
    await loadHook(wrapper.url, { format: 'module' }, load)
    await loadHook(leaf, { format: 'module' }, load)
    strictEqual((await resolveHook(root, { parentURL: leaf }, resolve)).url, root)
    strictEqual(new URL((await resolveHook(root, { parentURL: leaf }, resolve)).url).searchParams.get('iitm'), 'true')
  }
}

for (const mode of ['async', 'sync']) {
  const hook = createHook(meta)
  const url = `file:///malformed-native-${mode}.mjs`
  const result = { format: 'module', source: "import 'unterminated" }
  const warning = once(process, 'warning')
  const loadHook = mode === 'sync' ? hook.loadSync : hook.load
  strictEqual(await loadHook(url, { format: 'module' }, () => result), result)
  const [error] = await warning
  strictEqual(error.message, `'import-in-the-middle' failed to track imports for '${url}'`)
  strictEqual(error.cause instanceof Error, true)
}
