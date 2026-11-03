import { strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'

const require = createRequire(import.meta.url)
const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

for (const legacy of ['iitm-legacy-v1', 'iitm-legacy-v2', 'iitm-legacy-v3']) {
  const base = pathToFileURL(dirname(require.resolve(`${legacy}/package.json`)) + '/').href
  const modes = [['async', 'async']]
  if (supportsSyncHooks()) {
    modes.push(['sync', 'async'])
    if (legacy === 'iitm-legacy-v3') modes.push(['async', 'sync'], ['sync', 'sync'])
  }
  for (const mode of modes) {
    for (const order of [[0, 1], [1, 0]]) {
      for (const timing of ['early', 'late', 'warm', 'disjoint', 'worker']) {
        const scenario = {
          legacy: base,
          modes: mode,
          order,
          late: timing === 'late',
          warm: timing === 'warm',
          disjoint: timing === 'disjoint'
        }
        const result = spawnSync(process.execPath, [
          '--no-warnings', '--import', './test/fixtures/legacy-copy-registry-preload.mjs',
          `./test/fixtures/legacy-copy-registry-${timing === 'worker' ? 'worker' : 'app'}.mjs`
        ], {
          cwd: packageRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            IITM_TEST_FILE: '',
            IITM_LEGACY_SCENARIO: JSON.stringify(scenario)
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
