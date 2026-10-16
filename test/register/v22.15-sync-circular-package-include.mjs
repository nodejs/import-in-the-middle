import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'
import { testCircularPackageInclude } from '../fixtures/circular-package-include.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

await testCircularPackageInclude('sync')
