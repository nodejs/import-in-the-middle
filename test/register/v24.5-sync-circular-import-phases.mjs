import { supportsSyncHooks } from '../../register-hooks.mjs'
import { testCircularImportPhases } from '../fixtures/circular-import-phases.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

await testCircularImportPhases('sync')
