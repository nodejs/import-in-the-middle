import { strictEqual } from 'node:assert'
import { spawnSync } from 'node:child_process'

const asyncPreload = './test/fixtures/sync-async-coresidence-register-async.mjs'
const copyPreload = './test/fixtures/async-coresidence-register-copy.mjs'
const probePreload = './test/fixtures/sync-async-coresidence-probe.mjs'
const app = './test/fixtures/sync-async-coresidence-app.mjs'

const scenarios = [
  {
    name: 'original then copy, both include',
    preloads: [asyncPreload, copyPreload],
    asyncMode: 'include',
    copyMode: 'include',
    expectHit: true
  },
  {
    name: 'copy then original, both include',
    preloads: [copyPreload, asyncPreload],
    asyncMode: 'include',
    copyMode: 'include',
    expectHit: true
  },
  {
    name: 'only inner original includes',
    preloads: [asyncPreload, copyPreload],
    asyncMode: 'include',
    copyMode: 'skip',
    expectHit: true
  },
  {
    name: 'only outer copy includes',
    preloads: [asyncPreload, copyPreload],
    asyncMode: 'skip',
    copyMode: 'include',
    expectHit: true
  },
  {
    name: 'neither includes',
    preloads: [asyncPreload, copyPreload],
    asyncMode: 'skip',
    copyMode: 'skip',
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
      IITM_ASYNC_COPY_MODE: scenario.copyMode,
      IITM_EXPECT_HIT: scenario.expectHit ? '1' : '0'
    }
  })

  const output = `${scenario.name}\n${result.stderr || result.stdout}`
  strictEqual(result.signal, null, output)
  strictEqual(result.status, 0, output)
}
