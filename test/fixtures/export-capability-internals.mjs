import { strictEqual, throws } from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { register as registerAsync } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import Hook, { createAddHookMessageChannel } from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

const source = `export let value = 'original'
export let other = 'other'
export const state = { count: 0 }
export function update () { value = 'updated'; other = 'updated other' }
`
/** @typedef {{ value: string, other: string, state: { count: number }, update: () => void }} FixtureNamespace */

/**
 * @param {string} root
 * @param {string} name
 * @param {Record<string, string>} files
 */
function createPackage (root, name, files) {
  const directory = join(root, 'node_modules', name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.mjs' }))
  for (const [filename, contents] of Object.entries(files)) {
    writeFileSync(join(directory, filename), contents)
  }
  return directory
}

/**
 * @param {'sync' | 'async'} mode
 * @param {boolean} [customInclude]
 */
export async function reviewInternals (mode, customInclude = false) {
  if (mode === 'sync' && !supportsSyncHooks()) return
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'iitm-export-internals-')))
  try {
    const legacyDir = createPackage(root, 'legacy-internals', { 'index.mjs': source })
    const legacyPath = join(legacyDir, 'index.mjs')
    const packageDir = createPackage(root, 'internal-capability', {
      'index.mjs': `import * as child from './relative.mjs'
import * as absolute from './absolute.mjs'
import * as nested from 'nested-dependency'
export { child, absolute, nested }
${source}`,
      'relative.mjs': source,
      'absolute.mjs': source
    })
    const nestedDir = createPackage(packageDir, 'nested-dependency', { 'index.mjs': source })
    const duplicateDir = createPackage(nestedDir, 'internal-capability', { 'index.mjs': source })
    const commonJsDir = createPackage(root, 'cjs-internals', {
      'index.cjs': "exports.value = 'original'\nexports.state = { count: 0 }\n"
    })
    const scopedDir = createPackage(root, '@scope/internal-capability', {
      'index.mjs': `import * as child from './relative.mjs'
export { child }
${source}`,
      'relative.mjs': source
    })
    writeFileSync(join(root, 'entry.mjs'), 'export function load (name) { return import(name) }\n')
    writeFileSync(join(root, 'unrelated.mjs'), source)
    writeFileSync(join(root, 'global.mjs'), source)
    let legacyCalls = 0
    const legacyHook = new Hook(['legacy-internals'], { internals: true },
      /** @param {FixtureNamespace} namespace */
      namespace => {
        legacyCalls++
        namespace.value = 'legacy'
      })
    const exactLegacyHook = new Hook([legacyPath], { replaceExports: null },
      /** @param {FixtureNamespace} namespace */
      namespace => {
        strictEqual(namespace.value, 'legacy')
      })

    let acknowledge = async () => {}
    if (mode === 'sync') {
      register(customInclude
        ? { shouldInclude: /** @param {string} url */ url => url.startsWith(pathToFileURL(root).href) }
        : undefined)
    } else {
      const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
      registerAsync('../../hook.mjs', import.meta.url, registerOptions)
      acknowledge = waitForAllMessagesAcknowledged
    }
    await acknowledge()
    const legacy = await import(pathToFileURL(legacyPath))
    strictEqual(legacy.value, 'legacy')
    strictEqual(legacyCalls, 1)
    legacyHook.unhook()
    exactLegacyHook.unhook()
    const unrelatedPath = join(root, 'unrelated.mjs')
    await import(pathToFileURL(unrelatedPath))

    let internalCalls = 0
    let entryCalls = 0
    let scopedCalls = 0
    let nestedCalls = 0
    const packageHook = new Hook(['internal-capability'], { internals: true, replaceExports: ['value'] },
      /**
       * @param {FixtureNamespace} namespace
       * @param {string} name
       * @param {string} baseDir
       */
      (namespace, name, baseDir) => {
        internalCalls++
        strictEqual(baseDir, name.endsWith('index.mjs') ? duplicateDir : packageDir)
        namespace.state.count++
        namespace.value = 'hooked'
        if (name !== 'internal-capability' && name !== join('internal-capability', 'absolute.mjs')) {
          throws(() => { namespace.other = 'wrong' }, { name: 'TypeError' })
        }
      })
    // eslint-disable-next-line no-new
    new Hook(['internal-capability'], { replaceExports: ['other'] },
      /** @param {FixtureNamespace} namespace */
      namespace => {
        entryCalls++
        namespace.other = 'entry replacement'
      })
    const removedLegacy = new Hook(['internal-capability'], { internals: true }, () => {
      throw new Error('Removed legacy hook ran')
    })
    const removedExplicit = new Hook(['internal-capability'], { internals: true, replaceExports: ['other'] }, () => {
      throw new Error('Removed explicit hook ran')
    })
    removedLegacy.unhook()
    removedExplicit.unhook()
    // eslint-disable-next-line no-new
    new Hook([join(packageDir, 'absolute.mjs')], { internals: true, replaceExports: ['other'] },
      /** @param {FixtureNamespace} namespace */
      namespace => {
        namespace.other = 'absolute replacement'
      })
    // eslint-disable-next-line no-new
    new Hook(['@scope/internal-capability', 'nested-dependency'], { internals: true, replaceExports: null },
      /**
       * @param {FixtureNamespace} namespace
       * @param {string} name
       * @param {string} baseDir
       */
      (namespace, name, baseDir) => {
        if (name.startsWith('@scope/')) {
          scopedCalls++
          strictEqual(baseDir, scopedDir)
        } else {
          nestedCalls++
          strictEqual(baseDir, nestedDir)
        }
        namespace.state.count++
        throws(() => { namespace.value = 'wrong' }, { name: 'TypeError' })
        namespace.update()
      })
    await acknowledge()

    const { load } = await import(pathToFileURL(join(root, 'entry.mjs')))
    const namespace = await load('internal-capability')
    strictEqual(namespace.value, 'hooked')
    strictEqual(namespace.other, 'entry replacement')
    strictEqual(namespace.child.value, 'hooked')
    strictEqual(namespace.child.state.count, 1)
    namespace.child.update()
    strictEqual(namespace.child.value, 'hooked')
    strictEqual(namespace.child.other, 'updated other')
    strictEqual(namespace.absolute.other, 'absolute replacement')
    strictEqual(namespace.nested.value, 'updated')
    strictEqual(internalCalls, 3)
    strictEqual(entryCalls, 1)
    strictEqual(nestedCalls, 1)
    const duplicate = await import(pathToFileURL(join(duplicateDir, 'index.mjs')))
    strictEqual(duplicate.value, 'hooked')
    strictEqual(duplicate.other, 'other')
    strictEqual(internalCalls, 4)
    const scoped = await load('@scope/internal-capability')
    strictEqual(scoped.value, 'updated')
    strictEqual(scoped.child.value, 'updated')
    strictEqual(scopedCalls, 2)
    throws(() => {
      // eslint-disable-next-line no-new
      new Hook(['@scope/internal-capability'], { internals: true, replaceExports: ['value'] },
        /** @param {FixtureNamespace} exported */
        exported => {
          exported.value = 'late replacement'
        })
    }, { name: 'TypeError' })
    packageHook.unhook()

    let unrelatedCalls = 0
    // eslint-disable-next-line no-new
    new Hook([unrelatedPath], { replaceExports: null }, () => { unrelatedCalls++ })
    strictEqual(unrelatedCalls, mode === 'async' ? 0 : 1)

    // eslint-disable-next-line no-new
    new Hook(['cjs-internals'], { internals: true, replaceExports: ['value'] },
      /** @param {Pick<FixtureNamespace, 'value' | 'state'>} exported */
      exported => {
        exported.value = 'hooked CommonJS'
        exported.state.count++
        throws(() => { exported.state = { count: 0 } }, { name: 'TypeError' })
      })
    await acknowledge()
    const commonJs = await import(pathToFileURL(join(commonJsDir, 'index.cjs')))
    strictEqual(commonJs.value, 'hooked CommonJS')
    strictEqual(commonJs.state.count, 1)

    const globalPath = join(root, 'global.mjs')
    let globalCalls = 0
    // eslint-disable-next-line no-new
    new Hook(undefined, { internals: true, replaceExports: [] },
      /**
       * @param {FixtureNamespace} exported
       * @param {string} name
       */
      (exported, name) => {
        if (name !== globalPath) return
        globalCalls++
        exported.state.count++
        throws(() => { exported.value = 'wrong' }, { name: 'TypeError' })
      })
    await acknowledge()
    const global = await import(pathToFileURL(globalPath))
    strictEqual(global.state.count, 1)
    strictEqual(globalCalls, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
