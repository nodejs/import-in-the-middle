import { strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const filename = fileURLToPath(new URL('../../lib/supports-sync-hooks.js', import.meta.url))
const source = readFileSync(filename, 'utf8')
const versions = [
  ['18.20.8', false],
  ['21.7.3', false],
  ['22.22.2', false],
  ['22.22.3', true],
  ['22.22.3-nightly', true],
  ['22.23.0', true],
  ['23.9.0', false],
  ['24.11.0', false],
  ['24.11.1', true],
  ['24.12.0', true],
  ['25.0.0', false],
  ['25.1.0', true],
  ['26.0.0', true],
  ['27.0.0', true]
]

for (const [version, expected] of versions) {
  const context = { module: { exports: {} }, process: { versions: { node: version } } }
  runInNewContext(source, context, { filename })
  strictEqual(context.module.exports(), expected, version)
}
