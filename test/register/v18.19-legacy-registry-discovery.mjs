import { strictEqual } from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire, register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { Hook } = require('../../index.js')
register(new URL('../../hook.mjs', import.meta.url), { data: { include: [] } })
const directory = await mkdtemp(join(tmpdir(), 'iitm-registry-discovery-'))

try {
  const scenarios = [
    ...['1.15.0', '2.0.6', '30.0.0', undefined].map(
      /** @param {string | undefined} version */
      version => ({
        manifest: { name: 'import-in-the-middle', version },
        registry: { importHooks: [], toHook: [], specifiers: true }
      })
    ),
    { manifest: undefined, registry: {} },
    { manifest: { name: 'unrelated' }, registry: {} },
    { manifest: { name: 'import-in-the-middle', version: '3.3.1' }, registry: {} },
    { manifest: { name: 'import-in-the-middle', version: '3.3.1' }, registry: { importHooks: [] } },
    { manifest: { name: 'import-in-the-middle', version: '3.3.1' }, registry: { importHooks: [], toHook: [] } }
  ]
  for (const [index, { manifest, registry }] of scenarios.entries()) {
    const base = join(directory, String(index))
    await mkdir(join(base, 'lib'), { recursive: true })
    if (manifest !== undefined) await writeFile(join(base, 'package.json'), JSON.stringify(manifest))
    const entry = join(base, 'lib', 'register.js')
    await Promise.all([
      writeFile(entry, `module.exports = ${JSON.stringify(registry)}\n` +
        (registry.specifiers ? 'module.exports.specifiers = new Map()\n' : '')),
      writeFile(join(base, 'hook.mjs'), "export const marker = 'unchanged'\n")
    ])
    const loadedRegistry = require(entry)
    if (registry.specifiers) {
      let calls = 0
      const hook = new Hook(() => { calls++ })
      loadedRegistry.importHooks.forEach(
        /** @param {import('../../index.js').HookFunction} importHook */
        importHook => importHook('node:events', {}, 'events')
      )
      strictEqual(calls, 0)
      hook.unhook()
    }
    const loaded = await import(pathToFileURL(join(base, 'hook.mjs')))
    strictEqual(loaded.marker, 'unchanged')
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
