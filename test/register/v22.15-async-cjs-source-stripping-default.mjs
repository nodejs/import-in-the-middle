import { register } from 'node:module'
import { strictEqual } from 'node:assert'

register(new URL('../fixtures/source-providing-hook.mjs', import.meta.url).href, import.meta.url)
register(new URL('../../hook.mjs', import.meta.url).href, import.meta.url)

const mod = await import('../fixtures/cjs-requires-module-sync.js')

const result = mod.default.result
strictEqual(typeof result, 'string', 'require() of module-sync package should succeed')
strictEqual(
  result === 'from-cjs-via-module-sync' || result === 'from-cjs', true,
  `result should be from module-sync or CJS path, got: ${result}`
)

console.log('✅ default CJS source stripping prevented ERR_VM_MODULE_LINK_FAILURE in async hooks')
