import * as nodeModule from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { strictEqual } from 'node:assert'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const target = 'cjs-module-exports-no-named.js'
let receivedSource = false

nodeModule.registerHooks({
  load (url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (result.format === 'commonjs' && result.source == null && url.includes(target)) {
      result.source = readFileSync(fileURLToPath(url))
    }
    return result
  }
})

register({ disableCjsSourceStripping: true })

nodeModule.registerHooks({
  load (url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (result.format === 'commonjs' && url.includes(target)) {
      receivedSource = result.source != null
      result.source = String(result.source).replace('a: 1', 'a: 2')
    }
    return result
  }
})

const mod = await import(`../fixtures/${target}`)
strictEqual(receivedSource, true, 'downstream hook should receive hook-provided CJS source')
strictEqual(mod.default.a, 2, 'downstream hook should be able to transform CJS source')

console.log('✅ disableCjsSourceStripping preserves source for downstream sync hooks')
