import { deepStrictEqual } from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runTurbopackServer } from './turbopack-server.mjs'
import { prepareTurbopackWrapper, removeTurbopackWrapper } from './turbopack-wrapper.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const appDirectory = path.resolve(directory, '..', 'fixtures', 'test-nextjs-app')
const iitmDirectory = path.resolve(directory, '..', '..')
const hookSetup = path.join(appDirectory, 'iitm-hook-setup.cjs')
const nextBin = path.join(appDirectory, 'node_modules', '.bin', 'next')
const port = 3100

if (!existsSync(path.join(appDirectory, 'node_modules'))) {
  console.log('Installing Next.js app dependencies')
  execSync('npm install', { cwd: appDirectory })
}

await prepareTurbopackWrapper(appDirectory, 41)
try {
  console.log('Running `next build --turbopack`')
  execFileSync(nextBin, ['build', '--turbopack'], {
    cwd: appDirectory,
    env: { ...process.env, NODE_OPTIONS: '' },
    stdio: 'inherit'
  })

  console.log(`Starting Next.js server on port ${port} via \`next start\``)
  await runTurbopackServer({
    appDirectory,
    arguments: ['start', '--port', String(port)],
    hookSetup,
    iitmDirectory,
    nextBin,
    port
  }, verifyRoute)
} finally {
  await removeTurbopackWrapper(appDirectory)
}

/**
 * @param {string} url The application route URL.
 * @returns {Promise<void>}
 */
async function verifyRoute (url) {
  const response = await fetch(url)
  deepStrictEqual(await response.json(), {
    initialLive: 41,
    live: 42,
    stable: 43,
    hookedLive: 42
  })
}
