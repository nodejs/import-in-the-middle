import { strictEqual } from 'assert'
import { spawn } from 'child_process'

const node = process.execPath

const child = spawn(node, [
  '--no-warnings',
  '--experimental-loader',
  './test/loaders/wrap-failure-fallback-loader.mjs',
  '--experimental-loader',
  './test/generic-loader.mjs',
  './test/fixtures/wrap-failure-fallback-driver.mjs'
], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '' }
})

const code = await new Promise((resolve) => child.on('close', resolve))
strictEqual(code, 0)
