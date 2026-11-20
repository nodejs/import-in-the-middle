// Checks runtime imports and types of the packed `import-in-the-middle/wrapper.mjs` entry.

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'iitm-wrapper-'))

try {
  const { stdout } = await promisify(execFile)('npm', [
    'pack', '--dry-run', '--json', '--ignore-scripts'
  ], {
    cwd: root,
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_OPTIONS: '', npm_config_cache: join(directory, 'cache') }
  })
  const [{ files }] = JSON.parse(stdout)
  const paths = files.map(({ path }) => path.replace(/\\/g, '/'))
  for (const expected of ['wrapper.mjs', 'wrapper.d.mts', 'wrapper/create-wrapper.mjs', 'lib/wrapper.mjs']) {
    assert.ok(paths.includes(expected), `packed files should include ${expected}`)
  }

  const packageDirectory = join(directory, 'node_modules', 'import-in-the-middle')
  for (const { path } of files) {
    const destination = join(packageDirectory, path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(root, path), destination)
  }
  // Use the installed dependencies without fetching packages for this fixture.
  symlinkSync(join(root, 'node_modules'), join(packageDirectory, 'node_modules'), 'junction')
  const { createWrapperModule, createWrapperModuleSync } = await import(pathToFileURL(join(packageDirectory, 'wrapper.mjs')).href)
  const options = { url: 'file:///app/example.mjs', source: 'export const value = 1', specifier: './example.mjs' }
  const wrapper = createWrapperModuleSync(options)
  assert.equal(wrapper.imports[0].url, pathToFileURL(realpathSync(join(packageDirectory, 'lib/register.js'))).href)
  assert.deepEqual(await createWrapperModule(options), wrapper)

  const consumer = join(directory, 'consumer.mts')
  copyFileSync(new URL('../fixtures/wrapper-types.mts', import.meta.url), consumer)

  for (const [mode, exactOptionalPropertyTypes] of [['Node16', false], ['NodeNext', false], ['NodeNext', true]]) {
    const program = ts.createProgram([consumer], {
      module: ts.ModuleKind[mode],
      moduleResolution: ts.ModuleResolutionKind[mode],
      noEmit: true,
      strict: true,
      exactOptionalPropertyTypes,
      types: []
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    const label = exactOptionalPropertyTypes ? `${mode} with exactOptionalPropertyTypes` : mode
    assert.equal(diagnostics.length, 0, `${label}:\n${ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: ts.sys.resolvePath,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => '\n'
    })}`)
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
