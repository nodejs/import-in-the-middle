import * as nodeModule from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'
import { strictEqual } from 'node:assert'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

nodeModule.registerHooks({
  load (url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (result.format === 'commonjs' && result.source == null && url.startsWith('file:') && url.includes('cjs-requires-module-sync')) {
      result.source = readFileSync(fileURLToPath(url))
    }
    return result
  }
})

register({ disableCjsSourceStripping: true })

const error = await import('../fixtures/cjs-requires-module-sync.js').then(
  () => null,
  (e) => e
)

if (error === null) {
  console.log('ℹ️ ERR_VM_MODULE_LINK_FAILURE not triggered on ' + process.version)
} else {
  strictEqual(error.code, 'ERR_VM_MODULE_LINK_FAILURE', 'hook-provided CJS source should trigger ERR_VM_MODULE_LINK_FAILURE')
  console.log('✅ disableCjsSourceStripping exposed hook-provided CJS source (no stripping) in sync hooks')
}
