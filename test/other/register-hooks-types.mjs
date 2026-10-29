import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'iitm-types-'))

try {
  const { stdout } = await promisify(execFile)('npm', [
    'pack', '--dry-run', '--json', '--ignore-scripts'
  ], {
    cwd: root,
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_OPTIONS: '', npm_config_cache: join(directory, 'cache') }
  })
  const [{ files }] = JSON.parse(stdout)
  const packageDirectory = join(directory, 'node_modules/import-in-the-middle')
  for (const { path } of files) {
    const destination = join(packageDirectory, path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(root, path), destination)
  }
  const consumer = join(directory, 'consumer.mts')
  copyFileSync(new URL('../fixtures/register-hooks-types.mts', import.meta.url), consumer)

  for (const mode of ['Node16', 'NodeNext']) {
    const program = ts.createProgram([consumer], {
      module: ts.ModuleKind[mode],
      moduleResolution: ts.ModuleResolutionKind[mode],
      noEmit: true,
      strict: true,
      types: []
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert.equal(diagnostics.length, 0, `${mode}:\n${ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: ts.sys.resolvePath,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => '\n'
    })}`)
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
