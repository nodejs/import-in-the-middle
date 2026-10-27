import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import Hook, { createAddHookMessageChannel } from '../../index.js'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'iitm-selective-')))
/**
 * @param {string} parent
 * @param {string} name
 */
function createPackage (parent, name) {
  const directory = join(parent, 'node_modules', name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.mjs' }))
  for (const filename of ['index.mjs', 'child.mjs', 'removed.mjs']) {
    writeFileSync(join(directory, filename), 'export const state = { count: 0 }\n')
  }
  return directory
}

try {
  const directory = createPackage(root, '@scope/selected')
  const nested = createPackage(directory, 'nested')
  const duplicate = createPackage(nested, '@scope/selected')
  const ordinary = createPackage(root, 'ordinary')
  writeFileSync(join(root, 'entry.mjs'), 'export function load (name) { return import(name) }\n')
  const names = []
  const hook = new Hook(['@scope/selected'], { internals: true },
    /**
     * @param {{ state: { count: number } }} namespace
     * @param {string} name
     */
    (namespace, name) => {
      names.push(name)
      namespace.state.count++
    })
  const removed = new Hook(['ordinary'], () => { throw new Error('Removed hook ran') })
  removed.unhook()

  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
  register('../../hook.mjs', import.meta.url, registerOptions)
  await waitForAllMessagesAcknowledged()
  const afterChannel = new Hook(['ordinary'], () => {})
  afterChannel.unhook()
  await waitForAllMessagesAcknowledged()
  const { load } = await import(pathToFileURL(join(root, 'entry.mjs')))
  const entry = await load('@scope/selected')
  const child = await import(pathToFileURL(join(directory, 'child.mjs')))
  const duplicateChild = await import(pathToFileURL(join(duplicate, 'child.mjs')))
  strictEqual(entry.state.count, 1)
  strictEqual(child.state.count, 1)
  strictEqual(duplicateChild.state.count, 1)
  deepStrictEqual(names, ['@scope/selected', join('@scope/selected', 'child.mjs'), join('@scope/selected', 'child.mjs')])
  await import(pathToFileURL(join(nested, 'index.mjs')))
  await import(pathToFileURL(join(ordinary, 'index.mjs')))
  strictEqual(names.length, 3)
  hook.unhook()
  await waitForAllMessagesAcknowledged()
  await import(pathToFileURL(join(directory, 'removed.mjs')))

  let excludedReplay = 0
  const absolute = new Hook([join(directory, 'removed.mjs'), join(ordinary, 'index.mjs'), join(nested, 'index.mjs')],
    () => { excludedReplay++ })
  strictEqual(excludedReplay, 0)
  absolute.unhook()
  await waitForAllMessagesAcknowledged()

  let builtinCalls = 0
  const builtin = new Hook(['zlib'], () => { builtinCalls++ })
  await waitForAllMessagesAcknowledged()
  await import('node:zlib')
  strictEqual(builtinCalls, 1)
  builtin.unhook()
  await waitForAllMessagesAcknowledged()
} finally {
  rmSync(root, { recursive: true, force: true })
}
