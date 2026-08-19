import { register } from 'node:module'
import { strictEqual } from 'node:assert'

register(new URL('../fixtures/source-providing-hook.mjs', import.meta.url).href, import.meta.url)

register(new URL('../../hook.mjs', import.meta.url).href, import.meta.url, {
  data: { disableCjsSourceStripping: true }
})

const error = await import('../fixtures/cjs-requires-module-sync.js').then(
  () => null,
  (e) => e
)

if (error === null) {
  console.log('ℹ️ ERR_VM_MODULE_LINK_FAILURE not triggered on ' + process.version)
} else {
  strictEqual(error.code, 'ERR_VM_MODULE_LINK_FAILURE', 'hook-provided CJS source should trigger ERR_VM_MODULE_LINK_FAILURE')
  console.log('✅ disableCjsSourceStripping exposed hook-provided CJS source (no stripping) in async hooks')
}
