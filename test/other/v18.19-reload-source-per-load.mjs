import { strictEqual } from 'assert'
import { spawn } from 'child_process'

// Runs the driver with IITM (outer) composed over an upstream loader (inner)
// that returns different source on each `load()` of the same module. IITM must
// be registered last so it sits outermost and delegates to the inner loader via
// nextLoad; both loaders get their own --experimental-loader flag.
const node = process.execPath

const child = spawn(node, [
  '--no-warnings',
  '--experimental-loader',
  './test/loaders/reload-source-per-load-loader.mjs',
  '--experimental-loader',
  './test/generic-loader.mjs',
  './test/fixtures/reload-source-per-load-driver.mjs'
], { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } })

const code = await new Promise((resolve) => child.on('close', resolve))
strictEqual(code, 0)
