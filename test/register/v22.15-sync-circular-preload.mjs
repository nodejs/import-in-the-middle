import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'
import { testPreloadedCycle } from '../fixtures/preloaded-cycle.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

await testPreloadedCycle('sync')
