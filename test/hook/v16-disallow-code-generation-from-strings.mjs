// es-module-lexer v3 decodes strings without eval. Drive the real Hook under
// `--disallow-code-generation-from-strings` to prove that quoted export names
// and bare star re-export specifiers remain available to the wrapper.
import { strictEqual } from 'assert'
import { spawn } from 'child_process'

const node = process.execPath

const child = spawn(node, [
  '--disallow-code-generation-from-strings',
  '--no-warnings',
  '--experimental-loader',
  './test/generic-loader.mjs',
  './test/fixtures/disallow-code-generation-driver.mjs'
], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '' }
})

const code = await new Promise((resolve) => child.on('close', resolve))
strictEqual(code, 0)
