import { strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const testDirectory = await mkdtemp(join(packageRoot, 'test', 'iitm-copies-'))
const copies = [packageRoot, join(testDirectory, 'copy')]
const files = ['create-hook.mjs', 'hook.mjs', 'index.js', 'package.json', 'register-hooks.mjs', 'supports-sync-hooks.mjs']
const modes = [['async', 'async']]
if (supportsSyncHooks()) {
  modes.push(['sync', 'async'], ['async', 'sync'], ['sync', 'sync'])
}

try {
  for (const copy of copies.slice(1)) {
    await mkdir(copy)
    await Promise.all([
      cp(join(packageRoot, 'lib'), join(copy, 'lib'), { recursive: true }),
      ...files.map(/** @param {string} filename */ filename => copyFile(join(packageRoot, filename), join(copy, filename)))
    ])
  }

  for (const mode of modes) {
    for (const order of [[0, 1], [1, 0]]) {
      for (const include of ['overlap', 'disjoint', 'first', 'neither']) {
        for (const late of [false, true]) {
          const scenario = { modes: mode, order, include, late }
          const result = spawnSync(process.execPath, [
            '--no-warnings',
            '--import', './test/fixtures/cross-copy-registry-preload.mjs',
            './test/fixtures/cross-copy-registry-app.mjs'
          ], {
            cwd: packageRoot,
            encoding: 'utf8',
            env: {
              ...process.env,
              NODE_OPTIONS: '',
              IITM_TEST_FILE: '',
              IITM_COPIES: JSON.stringify(copies),
              IITM_COPY_SCENARIO: JSON.stringify(scenario)
            },
            timeout: 10_000
          })
          if (result.error) throw result.error
          const message = `${JSON.stringify(scenario)}\n${result.stderr || result.stdout}`
          strictEqual(result.signal, null, message)
          strictEqual(result.status, 0, message)
        }
      }
    }
  }
} finally {
  await rm(testDirectory, { recursive: true, force: true })
}
