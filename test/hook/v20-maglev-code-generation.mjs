import { strictEqual } from 'node:assert'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const nodeVersion = process.versions.node.split('.')

if (nodeVersion[0] === '20' && Number(nodeVersion[1]) < 9) {
  const noNodeOptionsEnv = { ...process.env }
  delete noNodeOptionsEnv.NODE_OPTIONS
  const maglevChild = spawn(process.execPath, [
    '--no-warnings',
    '--experimental-loader',
    './test/generic-loader.mjs',
    './test/fixtures/disallow-code-generation-driver.mjs'
  ], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '' }
  })
  const codegenChild = spawn(process.execPath, [
    './test/fixtures/disallow-code-generation-direct.mjs'
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--disallow-code-generation-from-strings'
    }
  })
  const noNodeOptionsChild = spawn(process.execPath, [
    './test/fixtures/disallow-code-generation-direct.mjs'
  ], {
    stdio: 'inherit',
    env: noNodeOptionsEnv
  })

  const [[maglevCode], [codegenCode], [noNodeOptionsCode]] = await Promise.all([
    once(maglevChild, 'close'),
    once(codegenChild, 'close'),
    once(noNodeOptionsChild, 'close')
  ])

  strictEqual(maglevCode, 0)
  strictEqual(codegenCode, 0)
  strictEqual(noNodeOptionsCode, 0)
}
