import { throws, strictEqual } from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import Hook from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  process.exit(0)
}

const fixtureRoot = await mkdtemp(join(tmpdir(), 'iitm-turbopack-nested-'))
const modulePath = join(fixtureRoot, 'node_modules', 'foo', 'node_modules', 'foo-bar', 'index.mjs')
const moduleUrl = pathToFileURL(modulePath)

try {
  await mkdir(dirname(modulePath), { recursive: true })
  await writeFile(modulePath, "export const value = 'original'\n")

  process.env.TURBOPACK = '1'
  nodeModule.registerHooks({
    resolve (specifier, context, nextResolve) {
      if (specifier === 'foo-reviewhash') return { url: moduleUrl.href, shortCircuit: true }
      return nextResolve(specifier, context)
    }
  })

  register({ include: ['foo-reviewhash'] })

  // eslint-disable-next-line no-new
  new Hook(['foo'], () => {
    throw new Error('The outer package hook must not run for foo-bar')
  })

  // eslint-disable-next-line no-new
  new Hook([modulePath], { replaceExports: [] }, namespace => {
    strictEqual(namespace.value, 'original')
    throws(() => { namespace.value = 'changed' }, { name: 'TypeError' })
  })

  const namespace = await import('foo-reviewhash')
  strictEqual(namespace.value, 'original')
} finally {
  await rm(fixtureRoot, { recursive: true, force: true })
}
