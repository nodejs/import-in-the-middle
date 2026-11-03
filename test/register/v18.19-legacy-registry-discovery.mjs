import { strictEqual } from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire, register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
require('../../index.js')
register(new URL('../../hook.mjs', import.meta.url), { data: { include: [] } })
const directory = await mkdtemp(join(tmpdir(), 'iitm-registry-discovery-'))

try {
  const scenarios = [
    { manifest: undefined, registry: {} },
    { manifest: { name: 'unrelated' }, registry: {} },
    { manifest: { name: 'import-in-the-middle' }, registry: {} },
    { manifest: { name: 'import-in-the-middle' }, registry: { importHooks: [] } },
    { manifest: { name: 'import-in-the-middle' }, registry: { importHooks: [], toHook: [] } }
  ]
  for (const [index, { manifest, registry }] of scenarios.entries()) {
    const base = join(directory, String(index))
    await mkdir(join(base, 'lib'), { recursive: true })
    if (manifest !== undefined) await writeFile(join(base, 'package.json'), JSON.stringify(manifest))
    const entry = join(base, 'lib', 'register.js')
    await Promise.all([
      writeFile(entry, `module.exports = ${JSON.stringify(registry)}\n`),
      writeFile(join(base, 'hook.mjs'), "export const marker = 'unchanged'\n")
    ])
    require(entry)
    const loaded = await import(pathToFileURL(join(base, 'hook.mjs')))
    strictEqual(loaded.marker, 'unchanged')
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
