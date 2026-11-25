// Executes facades produced by a small consumer-written synchronous adapter on
// `module.registerHooks`, covering require(esm), file-path require and import.
// The resolve hook maps each facade's placeholders through its manifest.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { supportsSyncHooks } from '../../supports-sync-hooks.mjs'
import { Hook } from '../../index.js'
import { createWrapperModuleSync } from '../../wrapper.mjs'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
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
 * @param {{ source?: unknown }} result
 * @param {string} url
 */
function sourceOf (result, url) {
  const { source } = result
  if (source == null) return readFileSync(fileURLToPath(url), 'utf8')
  return typeof source === 'string' ? source : Buffer.from(source).toString('utf8')
}

// Resolved URLs are real paths (macOS tmpdir is a symlink).
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'iitm-wrapper-')))

try {
  writeFiles(join(dir, 'node_modules', 'sync-pkg'), {
    'package.json': '{"type":"module","exports":{".":"./index.js"}}',
    'index.js': [
      'globalThis.__syncPkgEvaluations = (globalThis.__syncPkgEvaluations || 0) + 1',
      'export function value () { return 41 }',
      'export * from "./metadata.json" with { type: "json" }',
      "export * from './more.js'",
      ''
    ].join('\n'),
    'more.js': "export const more = 'more'\n",
    'metadata.json': '{"unused": true}'
  })
  writeFiles(join(dir, 'node_modules', 'sync-tla'), {
    'package.json': '{"type":"module"}',
    'index.js': 'await Promise.resolve()\nexport const x = 1\n'
  })

  // The facade is served at the module's own URL, so its original placeholder
  // resolves to this suffix, which the hooks below serve unwrapped.
  const ORIGINAL = '?iitm-original'
  const specifiers = new Map()
  // Facade URL -> its placeholder manifest.
  const manifests = new Map()
  const wraps = []
  let nextResolveForGraph

  nodeModule.registerHooks({
    resolve (specifier, context, nextResolve) {
      const entry = manifests.get(context.parentURL)?.find((entry) => entry.specifier === specifier)
      if (entry !== undefined) {
        const url = entry.kind === 'original' ? entry.url + ORIGINAL : entry.url
        return { url, format: entry.format, shortCircuit: true }
      }
      nextResolveForGraph = nextResolve
      const result = nextResolve(specifier, context)
      // Remember bare specifiers so Hook can match by package name.
      if (!/^[a-z][a-z0-9+.-]*:/i.test(specifier) && !specifier.startsWith('.') && !specifier.startsWith('/')) {
        specifiers.set(result.url, specifier)
      }
      return result
    },
    load (url, context, nextLoad) {
      const result = nextLoad(url, context)
      if (url.endsWith(ORIGINAL)) {
        return { format: 'module', source: sourceOf(result, url), shortCircuit: true }
      }
      // Classify by the loaded format, not by the require/import conditions.
      if (!/\/node_modules\/sync-(pkg|tla)\//.test(url) || result.format !== 'module') return result

      const { code, imports } = createWrapperModuleSync({
        url,
        // The hook's source may be bytes, which the wrapper accepts as-is.
        source: result.source ?? sourceOf(result, url),
        specifier: specifiers.get(url) ?? url,
        resolve (s, { parentURL, kind, importAttributes = {} }) {
          if (s === './metadata.json') assert.deepEqual(importAttributes, { type: 'json' })
          // Specifiers arrive as written. A `nextResolve` captured from a
          // `require` resolves against its own parent module, not `parentURL`,
          // so relative ones are joined here.
          if (s.startsWith('.') || s.startsWith('/')) return { url: new URL(s, parentURL).href }
          if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return { url: s }
          const conditions = kind === 'require' ? ['node', 'require'] : ['node', 'import']
          return nextResolveForGraph(s, { parentURL, conditions, importAttributes })
        },
        load (u, { format, importAttributes = {} }) {
          if (u.endsWith('/metadata.json')) assert.deepEqual(importAttributes, { type: 'json' })
          if (u.endsWith('/more.js')) assert.deepEqual(importAttributes, {})
          const loaded = nextLoad(u, { format, importAttributes })
          return { source: sourceOf(loaded, u), format: loaded.format }
        }
      })
      assert.equal(typeof code, 'string')
      assert.equal(imports[1].kind, 'original')
      assert.equal(imports[1].url, url)
      manifests.set(url, imports)
      wraps.push(url)
      return { format: 'module', source: code, shortCircuit: true }
    }
  })

  let hookCalls = 0
  const hook = new Hook(['sync-pkg'], (exported) => {
    hookCalls++
    exported.value = () => 42
  })

  const require = nodeModule.createRequire(join(dir, 'entry.js'))
  const pkgIndex = join(dir, 'node_modules', 'sync-pkg', 'index.js')

  const required = require('sync-pkg')
  assert.equal(required.value(), 42)
  assert.equal(required.more, 'more')
  assert.equal(Object.hasOwn(required, 'unused'), false)
  assert.equal(Object.hasOwn(required, 'module.exports'), false)
  assert.equal(require(pkgIndex).value(), 42)
  const imported = await import(pathToFileURL(pkgIndex).href)
  assert.equal(imported.value(), 42)
  assert.equal(imported.more, 'more')
  assert.equal(globalThis.__syncPkgEvaluations, 1)
  assert.equal(hookCalls, 1)
  hook.unhook()

  assert.throws(() => require('sync-tla'), (err) => err.code === 'ERR_REQUIRE_ASYNC_MODULE')
  const tlaUrl = pathToFileURL(join(dir, 'node_modules', 'sync-tla', 'index.js')).href
  assert.equal((await import(tlaUrl)).x, 1)
  assert.ok(wraps.includes(tlaUrl))

  const typedDir = join(dir, 'typed')
  const importText = process.execArgv.includes('--experimental-import-text')
  const textStar = importText ? "export * from './text.txt' with { type: 'text' }" : ''
  const typedSource = `
    export * from './left.mjs'
    export * from './right.mjs'
    export * from './shared.mjs' with { type: 'second' }
    ${textStar}
  `
  const firstStar = "export * from './shared.mjs' with { type: 'first', label: 'keep' }"
  const root = pathToFileURL(join(typedDir, 'root.mjs')).href
  const shared = pathToFileURL(join(typedDir, 'shared.mjs')).href
  const facade = pathToFileURL(join(typedDir, 'facade.mjs')).href
  writeFiles(typedDir, {
    'root.mjs': typedSource,
    'left.mjs': firstStar,
    'right.mjs': firstStar,
    'shared.mjs': '',
    'text.txt': 'export const fromText = 1'
  })

  function typedModule (context) {
    if (context.importAttributes.type === 'first') {
      assert.equal(context.importAttributes.label, 'keep')
      return { format: 'module', source: "export const contested = 1, first = 'first'" }
    }
    assert.equal(context.importAttributes.type, 'second')
    return { format: 'module', source: "export const contested = 2, second = 'second'" }
  }

  const { code, imports } = createWrapperModuleSync({
    url: root,
    source: typedSource,
    specifier: root,
    resolve: (specifier, { parentURL }) => ({ url: new URL(specifier, parentURL).href }),
    load (url, context) {
      if (url === shared) return typedModule(context)
      const source = readFileSync(fileURLToPath(url), 'utf8')
      return url.endsWith('.txt') ? { source, format: 'text' } : { source }
    }
  })
  writeFileSync(fileURLToPath(facade), code)
  assert.deepEqual(imports[2], {
    specifier: './__iitm_module_1__.js',
    kind: 'module',
    url: shared,
    format: 'module',
    importAttributes: { type: 'first', label: 'keep' }
  })

  const typedHook = nodeModule.registerHooks({
    resolve (specifier, context, nextResolve) {
      const entry = context.parentURL === facade && imports.find((entry) => entry.specifier === specifier)
      if (entry) return { url: entry.url, format: entry.format, shortCircuit: true }
      return nextResolve(specifier, context)
    },
    load (url, context, nextLoad) {
      if (url === shared) return { ...typedModule(context), shortCircuit: true }
      return nextLoad(url, context)
    }
  })
  try {
    const expected = { first: 'first', second: 'second' }
    assert.deepEqual({ ...await import(root) }, expected)
    assert.deepEqual({ ...await import(facade) }, expected)
  } finally {
    typedHook.deregister()
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
