import { register } from 'node:module'
import { strictEqual } from 'node:assert'

register(new URL('../fixtures/source-providing-hook.mjs', import.meta.url).href, import.meta.url)

register(new URL('../../hook.mjs', import.meta.url).href, import.meta.url, {
  data: { disableCjsSourceStripping: true }
})

const error = await import('../fixtures/cjs-requires-module-sync.js').then(
  () => { throw new Error('import should have failed with ERR_VM_MODULE_LINK_FAILURE') },
  (e) => e
)
strictEqual(error.code, 'ERR_VM_MODULE_LINK_FAILURE', 'hook-provided CJS source should trigger ERR_VM_MODULE_LINK_FAILURE')

console.log('✅ disableCjsSourceStripping exposed hook-provided CJS source (no stripping) in async hooks')
