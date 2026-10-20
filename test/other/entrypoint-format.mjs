import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'

const hookUrl = new URL('../../hook.mjs', import.meta.url)
const registerUrl = new URL('../../register-hooks.mjs', import.meta.url)
const upstreamUrl = new URL('../fixtures/entrypoint-esm-loader.mjs', import.meta.url)
const syncPreload = `import { register } from ${JSON.stringify(registerUrl.href)}; register({ include: [] })`
const upstreamSyncPreload = `
  import { registerHooks } from 'node:module';
  import { resolveSync } from ${JSON.stringify(upstreamUrl.href)};
  registerHooks({ resolve: resolveSync });
  ${syncPreload}
`
const loaders = [
  ['async', ['--experimental-loader', hookUrl.href]],
  ['async upstream', ['--experimental-loader', upstreamUrl.href]]
]
if (supportsSyncHooks()) {
  loaders.push(['sync', ['--import', `data:text/javascript,${encodeURIComponent(syncPreload)}`]])
  loaders.push(['sync upstream', ['--import', `data:text/javascript,${encodeURIComponent(upstreamSyncPreload)}`]])
}

// Older Node releases reject extensionless ESM even without IITM. An upstream
// loader supplies the format there, so preservation is still tested on them.
const [major, minor] = process.versions.node.split('.').map(Number)
const supportsExtensionlessEsm = major >= 21 || (major === 20 && minor >= 10) || (major === 18 && minor >= 19)

for (const [loader, args] of loaders) {
  const fixtures = [
    ['entrypoint-cjs', 'cjs entrypoint ran']
  ]
  if (supportsExtensionlessEsm || loader.includes('upstream')) {
    fixtures.push(['entrypoint-esm/main', 'esm entrypoint ran'])
  } else {
    console.log(`Skipping native extensionless ESM on ${process.version}; testing the upstream-loader case instead`)
  }
  for (const [fixture, output] of fixtures) {
    const entrypoint = fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url))
    const result = spawnSync(process.execPath, [...args, entrypoint], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--no-warnings' }
    })
    assert.equal(result.status, 0, `${loader}: ${fixture}\n${result.stderr}`)
    assert.equal(result.stdout.trim(), output, `${loader}: ${fixture}`)
  }
}
