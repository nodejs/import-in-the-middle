import { strictEqual } from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import * as module from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import Hook from '../../index.js'

/** @param {'async' | 'sync'} mode */
export async function testCircularPackageInclude (mode) {
  const directory = await mkdtemp(join(tmpdir(), 'iitm-package-include-'))
  const names = ['cycle-package', 'acyclic-package']
  let hook
  let lateHook
  try {
    for (const name of names) {
      const packageDirectory = join(directory, 'node_modules', name)
      await mkdir(packageDirectory, { recursive: true })
      await Promise.all([
        writeFile(join(packageDirectory, 'package.json'), JSON.stringify({ name, type: 'module', exports: './index.js' })),
        writeFile(join(packageDirectory, 'dependency.js'), ''),
        writeFile(join(packageDirectory, 'index.js'), "export const value = 1; export * from './leaf.js'"),
        writeFile(join(packageDirectory, 'leaf.js'), name === 'cycle-package'
          ? `import { value } from '${name}'; export function read () { return value }`
          : "import './dependency.js'; export function read () { return 1 }")
      ])
    }
    const entry = join(directory, 'entry.mjs')
    await writeFile(entry, "import * as acyclic from 'acyclic-package'; import * as cycle from 'cycle-package'; export { cycle, acyclic }")
    if (mode === 'sync') {
      const { register } = await import('../../register-hooks.mjs')
      register({ include: [...names, 'date-fns'] })
    } else {
      module.register(new URL('../../hook.mjs', import.meta.url), { data: { include: [...names, 'date-fns'] } })
    }
    /**
     * @param {Record<string, unknown>} exports
     * @param {string} name
     */
    hook = new Hook((exports, name) => {
      exports.value = 2
      if (name === 'date-fns') exports.addDays = () => 'hooked'
    })
    const { cycle, acyclic } = await import(pathToFileURL(entry).href)
    strictEqual(cycle.value, 2)
    strictEqual(cycle.read(), 2)
    strictEqual(acyclic.value, 2)
    strictEqual(acyclic.read(), 1)
    /** @param {Record<string, unknown>} exports */
    lateHook = new Hook(exports => { exports.value = 3 })
    strictEqual(cycle.value, 3)
    strictEqual(cycle.read(), 3)
    strictEqual(acyclic.value, 3)
    strictEqual((await import('date-fns')).addDays(), 'hooked')
  } finally {
    lateHook?.unhook()
    hook?.unhook()
    await rm(directory, { recursive: true, force: true })
  }
}
