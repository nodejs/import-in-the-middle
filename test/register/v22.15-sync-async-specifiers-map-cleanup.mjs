import { strictEqual } from 'node:assert'
import { spawnSync } from 'node:child_process'

import { supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const result = spawnSync(process.execPath, [
  '--no-warnings',
  '--loader',
  './test/loaders/specifiers-map-cleanup-loader.mjs',
  '--import',
  './test/fixtures/sync-async-specifiers-map-cleanup-register-sync.mjs',
  './test/fixtures/specifiers-map-cleanup-entry.mjs'
], {
  encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '' }
})

strictEqual(result.signal, null)
strictEqual(result.status, 0, result.stderr || result.stdout)
