import { strictEqual } from 'node:assert/strict'

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
    const helper = `${prefix}-helper.mjs`
    const hook = createHook(meta)
    /**
     * @param {string} url
     * @param {import('node:module').ResolveHookContext} context
     */
    const resolve = (url, context) => ({
      url: new URL(url, context.parentURL).href,
      format: url === helper ? [undefined, 'module', 'module-typescript', 'commonjs'][index] : 'module'
    })
    /** @param {string} url */
    const load = url => ({
      format: 'module',
      source: encode(url === root
        ? `export * from '${leaf}'`
        : url === helper ? 'export {}' : `import '${root}'; import '${helper}'; export const value = 1`)
    })
    const resolveHook = mode === 'sync' ? hook.resolveSync : hook.resolve
    const loadHook = mode === 'sync' ? hook.loadSync : hook.load
    const wrapper = await resolveHook(root, { parentURL: 'file:///native-entry.mjs' }, resolve)
    await loadHook(wrapper.url, { format: 'module' }, load)
    const native = await loadHook(leaf, { format: 'module' }, load)
    strictEqual(native.source.endsWith(`\nimport ${JSON.stringify(`${root}?iitm=bindings`)}\n`), true)
    strictEqual(new URL((await resolveHook(root, { parentURL: leaf }, resolve)).url).searchParams.get('iitm'), 'true')
  }
}

for (const mode of ['async', 'sync']) {
  for (const missingSource of [false, true]) {
    const prefix = `file:///shared-bindings-${mode}-${missingSource}`
    const roots = [1, 2, 3, 4].map(/** @param {number} index */ index => `${prefix}-root-${index}.mjs`)
    const pendingRoots = roots.slice(0, 3)
    const leaf = `${prefix}-leaf.mjs`
    const hook = createHook(meta)
    const resolveHook = mode === 'sync' ? hook.resolveSync : hook.resolve
    const loadHook = mode === 'sync' ? hook.loadSync : hook.load
    /** @param {string} url */
    const resolve = url => ({ url, format: 'module' })
    /** @param {string} url */
    const load = url => ({ format: 'module', source: url === leaf ? `${roots.map(/** @param {string} root */ root => `import '${root}';`).join('\n')} export const value = 1` : `export * from '${leaf}'` })
    for (const root of pendingRoots) {
      const wrapper = await resolveHook(root, { parentURL: `${prefix}-entry.mjs` }, resolve)
      await loadHook(wrapper.url, { format: 'module' }, load)
    }
    const nonModule = { format: 'commonjs', source: 'module.exports = {}' }
    strictEqual(await loadHook(leaf, { format: 'module' }, () => nonModule), nonModule)
    const native = missingSource ? { format: 'module', source: null } : load(leaf)
    const result = await loadHook(leaf, { format: 'module' }, () => native)
    if (missingSource) {
      strictEqual(result, native)
    } else {
      for (const root of pendingRoots) {
        strictEqual(result.source.includes(`\nimport ${JSON.stringify(`${root}?iitm=bindings`)}\n`), true)
      }
    }
    const laterWrapper = await resolveHook(roots[3], { parentURL: `${prefix}-entry.mjs` }, resolve)
    await loadHook(laterWrapper.url, { format: 'module' }, load)
    strictEqual(await loadHook(leaf, { format: 'module' }, () => native), native)
  }
}
