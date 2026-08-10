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
let receivedSource

nodeModule.registerHooks({
  load (url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (result.format === 'commonjs' && result.source == null && url.includes(target)) {
      result.source = readFileSync(fileURLToPath(url))
    }
    return result
  }
})

register()

nodeModule.registerHooks({
  load (url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (result.format === 'commonjs' && url.includes(target)) {
      receivedSource = result.source
    }
    return result
  }
})

const mod = await import(`../fixtures/${target}`)
strictEqual(receivedSource, undefined, 'downstream hook should receive undefined CJS source by default')
strictEqual(mod.default.a, 1, 'CJS module should still load natively')

console.log('✅ default CJS source stripping hides source from downstream sync hooks')
