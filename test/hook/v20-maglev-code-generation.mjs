import { strictEqual } from 'node:assert'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const nodeVersion = process.versions.node.split('.')

if (nodeVersion[0] === '20' && Number(nodeVersion[1]) < 9) {
  const maglevChild = spawn(process.execPath, [
    '--no-warnings',
    '--experimental-loader',
    './test/generic-loader.mjs',
    './test/fixtures/disallow-code-generation-driver.mjs'
  ], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '' }
  })

  const [maglevCode] = await once(maglevChild, 'close')
  strictEqual(maglevCode, 0)
}
