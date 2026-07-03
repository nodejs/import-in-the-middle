// Synchronous (`module.registerHooks`) counterpart to
// test/other/v18.19-reload-source-per-load.mjs: an inner sync loader returns
// different source on each `load()` of the same module, and IITM must let the
// wrapper's real namespace load reach it a second time rather than replay the
// source its export scan already read. Registered before IITM so IITM sits
// outermost and delegates via nextLoad.

import * as nodeModule from 'node:module'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'
import Hook from '../../index.js'
import { strictEqual } from 'node:assert'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const RELOAD_URL = new URL('file:///virtual/sync-reload-source-per-load.mjs').href
let loadCount = 0

nodeModule.registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier === 'virtual-sync-reload-source-per-load' || specifier === RELOAD_URL) {
      return { url: RELOAD_URL, format: 'module', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load (url, context, nextLoad) {
    if (url === RELOAD_URL) {
      loadCount += 1
      return { format: 'module', source: `export const value = ${loadCount}\n`, shortCircuit: true }
    }
    return nextLoad(url, context)
  }
})

register()

let hookedValue

// eslint-disable-next-line no-new
new Hook((exports, name) => {
  if (typeof name === 'string' && name.endsWith('sync-reload-source-per-load.mjs')) {
    hookedValue = exports.value
  }
})

// @ts-expect-error - resolved by the in-process loader above
const namespace = await import('virtual-sync-reload-source-per-load')

strictEqual(namespace.value, 2, 'module must execute the source its real load produced, not the export scan source')
strictEqual(hookedValue, 2, 'the hook must observe the real-load source too')

console.log('✅ module.registerHooks re-runs the upstream load for the real module load')
