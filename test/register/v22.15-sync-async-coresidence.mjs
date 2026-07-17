import { strictEqual } from 'node:assert'
import { spawnSync } from 'node:child_process'

import { supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

const asyncPreload = './test/fixtures/sync-async-coresidence-register-async.mjs'
const syncPreload = './test/fixtures/sync-async-coresidence-register-sync.mjs'
const probePreload = './test/fixtures/sync-async-coresidence-probe.mjs'
const app = './test/fixtures/sync-async-coresidence-app.mjs'

const scenarios = [
  {
    name: 'async then sync, both include',
    preloads: [asyncPreload, syncPreload],
    asyncMode: 'include',
    syncMode: 'include',
    expectHit: true
  },
  {
    name: 'sync then async, both include',
    preloads: [syncPreload, asyncPreload],
    asyncMode: 'include',
    syncMode: 'include',
    expectHit: true
  },
  {
    name: 'async includes, sync does not',
    preloads: [asyncPreload, syncPreload],
    asyncMode: 'include',
    syncMode: 'skip',
    expectHit: true
  },
  {
    name: 'sync registers first but only async includes',
    preloads: [syncPreload, asyncPreload],
    asyncMode: 'include',
    syncMode: 'skip',
    expectHit: true
  },
  {
    name: 'sync includes, async does not',
    preloads: [asyncPreload, syncPreload],
    asyncMode: 'skip',
    syncMode: 'include',
    expectHit: true
  },
  {
    name: 'sync registers first and only sync includes',
    preloads: [syncPreload, asyncPreload],
    asyncMode: 'skip',
    syncMode: 'include',
    expectHit: true
  },
  {
    name: 'neither includes',
    preloads: [asyncPreload, syncPreload],
    asyncMode: 'skip',
    syncMode: 'skip',
    expectHit: false
  }
]

for (const scenario of scenarios) {
  const args = ['--no-warnings']
  for (const preload of scenario.preloads) {
    args.push('--import', preload)
  }
  args.push('--import', probePreload, app)

  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      IITM_ASYNC_MODE: scenario.asyncMode,
      IITM_SYNC_MODE: scenario.syncMode,
      IITM_EXPECT_HIT: scenario.expectHit ? '1' : '0'
    }
  })

  const output = `${scenario.name}\n${result.stderr || result.stdout}`
  strictEqual(result.signal, null, output)
  strictEqual(result.status, 0, output)
}
