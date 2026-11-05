// Executes generated facades without any loader: the original package lives in
// a temp node_modules, the facade is written to a different file and imported
// directly, so the default identity `mapImport` points it at the original file
// and at the same `lib/register.js` instance `Hook`/`addHook` use.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Hook, addHook, removeHook } from '../../index.js'
import { createWrapperModule } from '../../wrapper.mjs'

/**
 * @param {string} dir
 * @param {Record<string, string>} files
 */
function writeFiles (dir, files) {
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
}

/**
 * @param {string} url
 * @param {string} specifier
 */
function options (url, specifier) {
  return {
    url,
    source: readFileSync(fileURLToPath(url), 'utf8'),
    specifier,
    resolve (s) {
      // Relative `export *` targets arrive already joined.
      return { url: s, format: 'module' }
    },
    load (u) {
      return { source: readFileSync(fileURLToPath(u), 'utf8'), format: 'module' }
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'iitm-wrapper-'))

try {
  const pkgDir = join(dir, 'node_modules', 'wrap-pkg')
  writeFiles(pkgDir, {
    'package.json': '{"type":"module"}',
    'index.js': [
      'globalThis.__wrapPkgEvaluations = (globalThis.__wrapPkgEvaluations || 0) + 1',
      'export function value () { return 41 }',
      "export default 'default-value'",
      "export * from './more.js'",
      ''
    ].join('\n'),
    'more.js': "export const more = 'more'\n"
  })
  const url = pathToFileURL(join(pkgDir, 'index.js')).href

  const code = await createWrapperModule(options(url, 'wrap-pkg'))
  assert.equal(typeof code, 'string')
  assert.equal(createWrapperModule({ ...options(url, 'wrap-pkg'), sync: true }), code,
    'sync generation should produce identical code')

  const calls = []
  const hook = new Hook(['wrap-pkg'], (exported, name, baseDir, format) => {
    calls.push({ name, baseDir, format })
    exported.value = () => 42
  })

  const observed = []
  const observer = (hookUrl, exported, specifier, format) => {
    if (hookUrl.includes('/node_modules/wrap-pkg/')) observed.push({ url: hookUrl, specifier, format })
  }
  addHook(observer)

  const facadePath = join(dir, 'facade.mjs')
  writeFileSync(facadePath, code)
  const facadeUrl = pathToFileURL(facadePath).href
  const facade = await import(facadeUrl)

  assert.equal(facade.value(), 42)
  assert.equal(facade.more, 'more')
  assert.equal(facade.default, 'default-value')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'wrap-pkg')
  assert.equal(calls[0].format, 'module')
  assert.equal(globalThis.__wrapPkgEvaluations, 1)

  assert.deepEqual(observed, [{ url, specifier: 'wrap-pkg', format: 'module' }])
  assert.notEqual(observed[0].url, facadeUrl)
  removeHook(observer)
  hook.unhook()

  // Registering after evaluation replays the module; the binding is live.
  let lateCalls = 0
  const late = new Hook(['wrap-pkg'], (exported) => {
    lateCalls++
    exported.value = () => 43
  })
  assert.equal(lateCalls, 1)
  assert.equal(facade.value(), 43)
  late.unhook()

  // The facade and a direct import share one unpatched original instance.
  const original = await import(url)
  assert.equal(original.value(), 41)
  assert.equal(globalThis.__wrapPkgEvaluations, 1)

  // A name reached through two stars from one defining module is read from
  // that module's own namespace import.
  const sameDir = join(dir, 'node_modules', 'same-pkg')
  writeFiles(sameDir, {
    'package.json': '{"type":"module"}',
    'index.js': "export * from './b.js'\nexport * from './c.js'\n",
    'b.js': "export * from './d.js'\n",
    'c.js': "export * from './d.js'\n",
    'd.js': "export function same () { return 'd' }\n"
  })
  const sameUrl = pathToFileURL(join(sameDir, 'index.js')).href
  const sameCode = await createWrapperModule(options(sameUrl, 'same-pkg'))
  const dUrl = pathToFileURL(join(sameDir, 'd.js')).href
  assert.ok(sameCode.includes(`import * as __ns0 from ${JSON.stringify(dUrl)}`))
  const sameFacadePath = join(dir, 'same-facade.mjs')
  writeFileSync(sameFacadePath, sameCode)
  const sameFacade = await import(pathToFileURL(sameFacadePath).href)
  assert.equal(sameFacade.same(), 'd')

  const sameHook = new Hook(['same-pkg'], (exported) => {
    exported.same = () => 'hooked'
  })
  assert.equal(sameFacade.same(), 'hooked')
  sameHook.unhook()

  // A builtin facade registers under its `node:` URL, which Hook matches by
  // the bare name, and patches only the facade's bindings.
  const events = await import('node:events')
  const builtinCalls = []
  const builtinHook = new Hook(['events'], (exported, name, baseDir, format) => {
    builtinCalls.push({ name, baseDir, format })
    exported.once = () => 'hooked once'
  })
  const builtinFacadePath = join(dir, 'events-facade.mjs')
  writeFileSync(builtinFacadePath, createWrapperModule({ url: 'node:events', specifier: 'events', sync: true }))
  const builtinFacade = await import(pathToFileURL(builtinFacadePath).href)
  assert.deepEqual(builtinCalls, [{ name: 'events', baseDir: undefined, format: 'builtin' }])
  assert.equal(builtinFacade.once(), 'hooked once')
  assert.equal(builtinFacade.default, events.default)
  assert.equal(builtinFacade.EventEmitter, events.EventEmitter)
  assert.notEqual(events.once, builtinFacade.once)
  builtinHook.unhook()
} finally {
  rmSync(dir, { recursive: true, force: true })
}
