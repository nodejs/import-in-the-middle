import { deepStrictEqual } from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { runTurbopackServer } from './turbopack-server.mjs'
import {
  prepareTurbopackWrapper,
  removeTurbopackWrapper,
  updateTurbopackSource
} from './turbopack-wrapper.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const appDirectory = path.resolve(directory, '..', 'fixtures', 'test-nextjs-app')
const iitmDirectory = path.resolve(directory, '..', '..')
const hookSetup = path.join(appDirectory, 'iitm-hook-setup.cjs')
const nextBin = path.join(appDirectory, 'node_modules', '.bin', 'next')
const port = 3099

if (!existsSync(path.join(appDirectory, 'node_modules'))) {
  console.log('Installing Next.js app dependencies')
  execSync('npm install', { cwd: appDirectory })
}

await prepareTurbopackWrapper(appDirectory, 41)
try {
  console.log(`Starting Next.js server on port ${port} via \`next dev --turbopack\``)
  await runTurbopackServer({
    appDirectory,
    arguments: ['dev', '--turbopack', '--port', String(port)],
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
  deepStrictEqual(await fetchResult(url), expectedResult(41))
  await updateTurbopackSource(appDirectory, 51)
  deepStrictEqual(await waitForRebuild(url), expectedResult(51))
}

/**
 * @param {string} url The application route URL.
 * @returns {Promise<Record<string, number>>}
 */
async function fetchResult (url) {
  const response = await fetch(url)
  return response.json()
}

/**
 * @param {string} url The application route URL.
 * @returns {Promise<Record<string, number>>}
 */
async function waitForRebuild (url) {
  let result
  for (let attempt = 0; attempt < 100; attempt++) {
    await delay(100)
    result = await fetchResult(url)
    if (result.initialLive === 51) return result
  }
  throw new Error(`Turbopack did not rebuild the wrapper dependency: ${JSON.stringify(result)}`)
}

/**
 * @param {number} initialLive The dependency's initial live export.
 * @returns {{ initialLive: number, live: number, stable: number, hookedLive: number }}
 */
function expectedResult (initialLive) {
  return {
    initialLive,
    live: initialLive + 1,
    stable: 43,
    hookedLive: initialLive + 1
  }
}
