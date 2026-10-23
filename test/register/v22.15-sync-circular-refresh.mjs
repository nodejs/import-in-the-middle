import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'
import { testCircularRefresh } from '../fixtures/circular-refresh.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

await testCircularRefresh('sync')
