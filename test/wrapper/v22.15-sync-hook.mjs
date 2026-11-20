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
      "export * from './more.js'",
      ''
    ].join('\n'),
    'more.js': "export const more = 'more'\n"
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
        resolve (s, { parentURL, kind }) {
          // Specifiers arrive as written. A `nextResolve` captured from a
          // `require` resolves against its own parent module, not `parentURL`,
          // so relative ones are joined here.
          if (s.startsWith('.') || s.startsWith('/')) return { url: new URL(s, parentURL).href }
          if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return { url: s }
          const conditions = kind === 'require' ? ['node', 'require'] : ['node', 'import']
          return nextResolveForGraph(s, { parentURL, conditions, importAttributes: {} })
        },
        load (u, { format }) {
          const loaded = nextLoad(u, { format, importAttributes: {} })
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
} finally {
  rmSync(dir, { recursive: true, force: true })
}
