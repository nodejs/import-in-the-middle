import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'

const hookUrl = new URL('../../hook.mjs', import.meta.url)
const registerUrl = new URL('../../register-hooks.mjs', import.meta.url)
const syncPreload = `import { register } from ${JSON.stringify(registerUrl.href)}; register({ include: [] })`
const loaders = [
  ['async', ['--experimental-loader', hookUrl.href]]
]
if (supportsSyncHooks()) {
  loaders.push(['sync', ['--import', `data:text/javascript,${encodeURIComponent(syncPreload)}`]])
}

for (const [loader, args] of loaders) {
  for (const [fixture, output] of [
    ['entrypoint-esm/main', 'esm entrypoint ran'],
    ['entrypoint-cjs', 'cjs entrypoint ran']
  ]) {
    const entrypoint = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url))
    const result = spawnSync(process.execPath, [...args, entrypoint], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--no-warnings' }
    })
    assert.equal(result.status, 0, `${loader}: ${fixture}\n${result.stderr}`)
    assert.equal(result.stdout.trim(), output, `${loader}: ${fixture}`)
  }
}
