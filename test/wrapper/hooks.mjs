// Executes generated facades without IITM's loader: the original package lives
// in a temp node_modules, and the facade is written to a different file with
// its `imports` manifest next to it. Each placeholder is resolved through the
// manifest to its `url`: the original file, the defining modules and the same
// `lib/register.js` instance `Hook`/`addHook` use. That is done by a
// `module.register` resolve hook where available, otherwise by rewriting the
// placeholders to their URLs.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { init, parse } from 'es-module-lexer'

import { Hook, addHook, removeHook } from '../../index.js'
import { createWrapperModule, createWrapperModuleSync } from '../../wrapper.mjs'

await init

const useLoader = typeof nodeModule.register === 'function'
if (useLoader) {
  nodeModule.register(new URL('../fixtures/wrapper-manifest-loader.mjs', import.meta.url))
}

/**
 * Replaces each placeholder of `code` with its manifest URL.
 *
 * @param {{ code: string, imports: { specifier: string, url: string }[] }} result
 */
function link ({ code, imports }) {
  const targets = new Map(imports.map(({ specifier, url }) => [specifier, url]))
  let linked = ''
  let last = 0
  for (const { specifier, start, end } of parse(code)[0]) {
    linked += code.slice(last, start) + JSON.stringify(targets.get(specifier)).slice(1, -1)
    last = end
  }
  return linked + code.slice(last)
}

/**
 * Writes the facade and its manifest, and imports it.
 *
 * @param {string} path
 * @param {{ code: string, imports: object[] }} result
 */
async function importFacade (path, result) {
  writeFileSync(path, useLoader ? result.code : link(result))
  writeFileSync(`${path}.imports.json`, JSON.stringify(result.imports))
  return import(pathToFileURL(path).href)
}

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
    resolve (s, { parentURL }) {
      // Relative `export *` specifiers arrive as written.
      return { url: new URL(s, parentURL).href, format: 'module' }
    },
    load (u) {
      return { source: readFileSync(fileURLToPath(u), 'utf8'), format: 'module' }
    }
  }
}

// Canonical URLs are real paths (macOS tmpdir is a symlink), as the manifest
// targets resolve without Node.js's own symlink resolution.
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'iitm-wrapper-')))

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

  const result = await createWrapperModule(options(url, 'wrap-pkg'))
  assert.deepEqual(createWrapperModuleSync(options(url, 'wrap-pkg')), result,
    'sync generation should produce an identical result')
  assert.deepEqual(result.imports.map((entry) => entry.url), [
    new URL('../../lib/register.js', import.meta.url).href,
    url
  ])

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
  const facadeUrl = pathToFileURL(facadePath).href
  const facade = await importFacade(facadePath, result)

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
  const sameResult = await createWrapperModule(options(sameUrl, 'same-pkg'))
  const dUrl = pathToFileURL(join(sameDir, 'd.js')).href
  assert.ok(sameResult.code.includes('import * as __ns0 from "./__iitm_module_1__.js"'))
  assert.deepEqual(sameResult.imports[2], { specifier: './__iitm_module_1__.js', kind: 'module', url: dUrl, format: 'module' })
  const sameFacade = await importFacade(join(dir, 'same-facade.mjs'), sameResult)
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
  const builtinResult = createWrapperModuleSync({ url: 'node:events', specifier: 'events' })
  assert.deepEqual(builtinResult.imports[1], { specifier: './__iitm_module_0__.js', kind: 'original', url: 'node:events', format: 'builtin' })
  const builtinFacade = await importFacade(join(dir, 'events-facade.mjs'), builtinResult)
  assert.deepEqual(builtinCalls, [{ name: 'events', baseDir: undefined, format: 'builtin' }])
  assert.equal(builtinFacade.once(), 'hooked once')
  assert.equal(builtinFacade.default, events.default)
  assert.equal(builtinFacade.EventEmitter, events.EventEmitter)
  assert.notEqual(events.once, builtinFacade.once)
  builtinHook.unhook()
} finally {
  rmSync(dir, { recursive: true, force: true })
}
