import { strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('../fixtures/typescript-normalized-format-register-hooks.mjs', import.meta.url))
const result = spawnSync(process.execPath, ['--no-warnings', fixture], {
  encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '' }
})

strictEqual(result.status, 0, result.stderr || result.stdout)
