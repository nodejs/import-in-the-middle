import { strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const testDirectory = await mkdtemp(join(packageRoot, 'test', "iitm's-fixture-"))
const installedPackageDirectory = join(testDirectory, 'node_modules', 'import-in-the-middle')

try {
  await mkdir(join(installedPackageDirectory, 'lib'), { recursive: true })

  const packageFiles = [
    'create-hook.mjs',
    'hook.mjs',
    'index.js',
    'package.json',
    'register-hooks.mjs',
    'supports-sync-hooks.mjs',
    'lib/get-esm-exports.mjs',
    'lib/get-exports.mjs',
    'lib/io.mjs',
    'lib/register.js'
  ]
  const setupPromises = []
  for (const filename of packageFiles) {
    setupPromises.push(copyFile(join(packageRoot, filename), join(installedPackageDirectory, filename)))
  }

  setupPromises.push(writeFile(join(testDirectory, 'app.mjs'), `
import { strictEqual } from 'node:assert/strict'
import { readFile } from 'node:fs'

strictEqual(readFile(), 'hooked')
`))

  const instruments = new Map([
    ['async', `
import { register } from 'node:module'
import { Hook, createAddHookMessageChannel } from 'import-in-the-middle'

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions)

/**
 * @param {typeof import('node:fs')} exports
 */
function hookFs (exports) {
  exports.readFile = () => 'hooked'
}

Hook(['fs'], hookFs)
await waitForAllMessagesAcknowledged()
`]
  ])
  if (supportsSyncHooks()) {
    instruments.set('sync', `
import { Hook } from 'import-in-the-middle'
import { register } from 'import-in-the-middle/register-hooks.mjs'

register({ include: ['fs'] })

/**
 * @param {typeof import('node:fs')} exports
 */
function hookFs (exports) {
  exports.readFile = () => 'hooked'
}

Hook(['fs'], hookFs)
`)
  }

  for (const [name, source] of instruments) {
    const instrumentFilename = `instrument-${name}.mjs`
    setupPromises.push(writeFile(join(testDirectory, instrumentFilename), source))
  }
  await Promise.all(setupPromises)

  for (const name of instruments.keys()) {
    const instrumentFilename = `instrument-${name}.mjs`
    const result = spawnSync(
      process.execPath,
      ['--import', `./${instrumentFilename}`, './app.mjs'],
      {
        cwd: testDirectory,
        encoding: 'utf8',
        env: { ...process.env, IITM_TEST_FILE: '', NODE_OPTIONS: '' },
        timeout: 10_000
      }
    )
    if (result.error) throw result.error
    strictEqual(result.status, 0, `${name} loader failed:\n${result.stderr}`)
  }
} finally {
  await rm(testDirectory, { recursive: true, force: true })
}
