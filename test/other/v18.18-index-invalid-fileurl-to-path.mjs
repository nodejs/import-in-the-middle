import { strictEqual } from 'assert'
import { spawn } from 'child_process'

// Exercise index.js's `fileURLToPath()` try/catch in a user-realistic way:
// another loader resolves a module to a malformed file URL that still parses.
const node = process.execPath

const child = spawn(node, [
  '--no-warnings',
  '--experimental-loader',
  './test/loaders/invalid-fileurl-module-loader.mjs',
  '--experimental-loader',
  './test/generic-loader.mjs',
  './test/fixtures/invalid-fileurl-module-driver.mjs'
], {
  stdio: 'inherit',
  // The test runner sets NODE_OPTIONS with its own loader. Clear it so this
  // child process uses *only* the loader chain we define here.
  env: { ...process.env, NODE_OPTIONS: '' }
})

const code = await new Promise((resolve) => child.on('close', resolve))
strictEqual(code, 0)
