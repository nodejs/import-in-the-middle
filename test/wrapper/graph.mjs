// Module-graph analysis of `createWrapperModule` over a virtual graph: export
// shapes, `export *` merging, CommonJS re-exports, format inference, builtins,
// `mapImport` and escaping. Nothing here exists on disk.
import assert from 'node:assert/strict'
import { init, parse } from 'es-module-lexer'

import { createWrapperModule } from '../../wrapper.mjs'

await init

const dir = 'file:///virtual/graph/'
const rootUrl = `${dir}root.mjs`
const runtimeUrl = new URL('../../lib/register.js', import.meta.url).href

/**
 * Serves `files` (keyed by name relative to `dir`) and records adapter calls.
 * `aliases` maps a raw specifier to a URL, for bare or `#` specifiers.
 */
function virtualGraph (files, aliases = {}) {
  const calls = { resolve: [], load: [] }
  return {
    calls,
    resolve (specifier, context) {
      calls.resolve.push([specifier, context])
      if (aliases[specifier] !== undefined) return aliases[specifier]
      return { url: new URL(specifier, context.parentURL).href }
    },
    load (url, context) {
      calls.load.push([url, context])
      const file = files[url.slice(dir.length)]
      if (file === undefined || !url.startsWith(dir)) throw new Error(`unexpected load of ${url}`)
      return typeof file === 'string' ? { source: file } : file
    }
  }
}

/**
 * Generates the facade in both modes, asserts they agree on the code and on
 * the adapter calls, and parses it. `graph.calls` holds the calls of one run.
 */
async function wrap (source, graph, extra = {}) {
  const options = { url: rootUrl, source, specifier: './root.mjs', resolve: graph.resolve, load: graph.load, ...extra }
  const code = createWrapperModule({ ...options, sync: true })
  const syncCalls = { resolve: graph.calls.resolve.splice(0), load: graph.calls.load.splice(0) }
  assert.equal(await createWrapperModule(options), code)
  assert.deepEqual(graph.calls, syncCalls)
  const [imports, exports] = parse(code)
  return { code, exports: exports.map((e) => e.name), imports: imports.map((i) => i.specifier) }
}

// Export shapes: default, named and quoted (string-literal) names.
{
  const { exports } = await wrap(
    "const x = 1, y = 2\nexport default 0\nexport const named = 1\nexport { x as \"a-b\" }\nexport { y as 'quo\"te' }\n",
    virtualGraph({})
  )
  assert.deepEqual(exports.sort(), ['a-b', 'default', 'named', 'quo"te'].sort())
}

// A star chain root -> b -> c exposes c's names but not the targets' defaults.
{
  const { exports } = await wrap("export * from './b.mjs'\nexport default 1\n", virtualGraph({
    'b.mjs': "export * from './c.mjs'\nexport const b = 1\nexport default 2\n",
    'c.mjs': 'export const c = 1\nexport default 3\n'
  }))
  assert.deepEqual(exports.sort(), ['b', 'c', 'default'])
}

// An explicit export overrides a star name of the same name.
{
  const { exports } = await wrap("export * from './b.mjs'\nexport const shared = 1\n", virtualGraph({
    'b.mjs': 'export const shared = 2\nexport const other = 1\n'
  }))
  assert.deepEqual(exports.sort(), ['other', 'shared'])
}

// Two stars exporting the same name from different defining modules are
// ambiguous, so the name is dropped.
{
  const { exports } = await wrap("export * from './b.mjs'\nexport * from './c.mjs'\n", virtualGraph({
    'b.mjs': 'export const dup = 1\nexport const b = 1\n',
    'c.mjs': 'export const dup = 2\nexport const c = 1\n'
  }))
  assert.deepEqual(exports.sort(), ['b', 'c'])
}

// Two stars reaching the same defining module keep the name, which the facade
// reads from the defining module imported through `mapImport`.
{
  const graph = virtualGraph({
    'b.mjs': "export * from './d.mjs'\n",
    'c.mjs': "export * from './d.mjs'\n",
    'd.mjs': 'export const same = 1\n'
  })
  const mapImport = (url) => `${url}?original`
  const { exports, imports } = await wrap("export * from './b.mjs'\nexport * from './c.mjs'\n", graph, { mapImport })
  assert.deepEqual(exports, ['same'])
  assert.ok(imports.includes(`${dir}d.mjs?original`))

  // Star specifiers reach resolve already joined against the declaring module.
  for (const [specifier, context] of graph.calls.resolve) {
    assert.equal(context.kind, 'import')
    assert.ok(specifier.startsWith(dir), specifier)
  }
  assert.deepEqual(graph.calls.resolve.map(([specifier, { parentURL }]) => [specifier, parentURL]), [
    [`${dir}b.mjs`, rootUrl],
    [`${dir}d.mjs`, `${dir}b.mjs`],
    [`${dir}c.mjs`, rootUrl],
    [`${dir}d.mjs`, `${dir}c.mjs`]
  ])
}

// CommonJS re-exports reach resolve as written, with kind 'require', including
// package `#` imports, which the caller resolves.
{
  const graph = virtualGraph({
    'c.cjs': "module.exports = require('./d.cjs')\n",
    'd.cjs': 'exports.z = 1\n',
    'c2.cjs': "module.exports = require('#internal')\n",
    'internal.cjs': 'exports.w = 1\n'
  }, { '#internal': { url: `${dir}internal.cjs`, format: 'commonjs' } })
  const { exports } = await wrap("export * from './c.cjs'\nexport * from './c2.cjs'\n", graph)
  assert.ok(exports.includes('z'))
  assert.ok(exports.includes('w'))
  const requires = graph.calls.resolve.filter(([, context]) => context.kind === 'require')
  assert.deepEqual(requires, [
    ['./d.cjs', { parentURL: `${dir}c.cjs`, kind: 'require' }],
    ['#internal', { parentURL: `${dir}c2.cjs`, kind: 'require' }]
  ])
}

// CommonJS re-exports of builtin names reach resolve too, so the caller can map
// them to a shim; one resolved to a `node:` URL is analysed without load.
{
  const graph = virtualGraph({
    'c.cjs': "module.exports = require('events')\n",
    'c2.cjs': "module.exports = require('node:util')\n",
    'shim.cjs': 'exports.shimOnly = 1\n'
  }, {
    events: { url: `${dir}shim.cjs`, format: 'commonjs' },
    'node:util': { url: 'node:util', format: 'builtin' }
  })
  const { exports } = await wrap("export * from './c.cjs'\nexport * from './c2.cjs'\n", graph)
  assert.ok(exports.includes('shimOnly'))
  assert.ok(!exports.includes('EventEmitter'))
  assert.ok(exports.includes('inspect'))
  assert.deepEqual(graph.calls.load.map(([url]) => url.slice(dir.length)), ['c.cjs', 'shim.cjs', 'c2.cjs'])
}

// CommonJS `.json` and `.node` re-exports are resolved but never loaded.
{
  const graph = virtualGraph({
    'c.cjs': "module.exports = require('./data.json')\n",
    'a.cjs': "module.exports = require('./addon.node')\n"
  })
  await wrap("export * from './c.cjs'\nexport * from './a.cjs'\n", graph)
  const requires = graph.calls.resolve.filter(([, context]) => context.kind === 'require').map(([s]) => s)
  assert.deepEqual(requires, ['./data.json', './addon.node'])
  assert.deepEqual(graph.calls.load.map(([url]) => url.slice(dir.length)), ['c.cjs', 'a.cjs'])
}

// A format from resolve is retained when load omits it. CommonJS-looking
// assignments to a local object in an exportless ESM are not real exports.
for (const source of ['', 'const exports = {}; exports.shared = 1\n']) {
  const loaded = Object.freeze({ source })
  const graph = virtualGraph({ 'empty.js': loaded }, {
    [`${dir}empty.js`]: { url: `${dir}empty.js`, format: 'module' }
  })
  const { exports } = await wrap("export * from './empty.js'\n", graph)
  assert.deepEqual(exports, [])
  assert.deepEqual(graph.calls.load, [[`${dir}empty.js`, { format: 'module' }]])
  assert.equal(Object.hasOwn(loaded, 'format'), false)
}

// A false CommonJS export must not make a real ESM star export ambiguous.
{
  const graph = virtualGraph({
    'empty.js': { source: 'const exports = {}; exports.shared = 1\n', format: undefined },
    'real.js': 'export const shared = 2\n'
  }, {
    [`${dir}empty.js`]: { url: `${dir}empty.js`, format: 'module' }
  })
  const { exports } = await wrap("export * from './empty.js'\nexport * from './real.js'\n", graph)
  assert.deepEqual(exports, ['shared'])
}

// An explicit load format still overrides the format from resolve.
{
  const graph = virtualGraph({
    'empty.js': { source: 'const exports = {}; exports.shared = 1\n', format: 'module' }
  }, {
    [`${dir}empty.js`]: { url: `${dir}empty.js`, format: 'commonjs' }
  })
  const { exports } = await wrap("export * from './empty.js'\n", graph)
  assert.deepEqual(exports, [])
  assert.deepEqual(graph.calls.load, [[`${dir}empty.js`, { format: 'commonjs' }]])
}

// Without a format from resolve or load, ESM syntax is analysed as ESM and
// anything else as CommonJS.
{
  const graph = virtualGraph({
    'esm.js': 'export const e = 1\n',
    'cjs.js': 'exports.k = 1\n'
  })
  const { exports } = await wrap("export * from './esm.js'\nexport * from './cjs.js'\n", graph)
  // Node versions with the CommonJS `module.exports` alias also expose it.
  assert.ok(exports.includes('e'))
  assert.ok(exports.includes('k'))
  assert.deepEqual(graph.calls.load.map(([, context]) => context.format), [undefined, undefined])
}

// Builtins are analysed without calling load.
{
  const graph = virtualGraph({}, { 'node:events': { url: 'node:events', format: 'builtin' } })
  const { exports } = await wrap("export * from 'node:events'\n", graph)
  assert.ok(exports.includes('EventEmitter'))
  assert.equal(graph.calls.load.length, 0)
}
// A builtin resolved to a `node:` URL without a format is still not loaded.
{
  const graph = virtualGraph({}, { events: { url: 'node:events' } })
  const { exports } = await wrap("export * from 'events'\n", graph)
  assert.ok(exports.includes('EventEmitter'))
  assert.equal(graph.calls.load.length, 0)
}

// A builtin root needs no source or adapters. Its facade imports the builtin
// through mapImport, binds `module.exports` without re-exporting it, and
// registers with the `builtin` format. Given adapters are never called.
{
  const graph = virtualGraph({})
  const options = { url: 'node:events', specifier: 'events', resolve: graph.resolve, load: graph.load }
  const code = createWrapperModule({ ...options, sync: true })
  assert.equal(await createWrapperModule(options), code)
  assert.equal(createWrapperModule({ url: 'node:events', specifier: 'events', sync: true }), code)
  assert.equal(await createWrapperModule({ url: 'node:events', specifier: 'events' }), code)
  assert.equal(graph.calls.resolve.length + graph.calls.load.length, 0)

  const [imports, exports] = parse(code)
  const names = exports.map((e) => e.name)
  for (const name of ['default', 'EventEmitter', 'once']) assert.ok(names.includes(name), name)
  assert.ok(!names.includes('module.exports'))
  assert.deepEqual(imports.map((i) => i.specifier), [runtimeUrl, 'node:events'])
  assert.ok(code.includes('register("node:events", __binder, "events", "builtin")'))

  const mapped = createWrapperModule({
    url: 'node:events',
    specifier: 'events',
    sync: true,
    mapImport: (url, kind) => kind === 'runtime' ? 'mapped-runtime' : `${url}?original`
  })
  assert.deepEqual(parse(mapped)[0].map((i) => i.specifier), ['mapped-runtime', 'node:events?original'])
}

// `node:`-only builtins are recognized too.
{
  const code = createWrapperModule({ url: 'node:test', specifier: 'node:test', sync: true })
  assert.ok(parse(code)[1].some((e) => e.name === 'test'))
}

// The root is served from `source`, never from load, even through a star cycle
// root -> b -> root; generation still terminates.
{
  const graph = virtualGraph({ 'b.mjs': "export * from './root.mjs'\nexport const b = 1\n" })
  const { exports } = await wrap("export * from './b.mjs'\nexport const r = 1\n", graph)
  assert.deepEqual(exports.sort(), ['b', 'r'])
  assert.ok(graph.calls.load.every(([url]) => url !== rootUrl))
}

// An empty root has no exports but still registers.
{
  const graph = virtualGraph({})
  const { code, exports } = await wrap('', graph)
  assert.deepEqual(exports, [])
  assert.ok(code.includes('register('))
  assert.equal(graph.calls.resolve.length + graph.calls.load.length, 0)
}

// Byte sources returned by load are decoded.
{
  const { exports } = await wrap("export * from './buf.mjs'\nexport * from './u8.mjs'\nexport * from './ab.mjs'\n", virtualGraph({
    'buf.mjs': { source: Buffer.from('export const fromBuffer = 1\n'), format: 'module' },
    'u8.mjs': { source: new TextEncoder().encode('export const fromUint8 = 1\n'), format: 'module' },
    'ab.mjs': { source: new TextEncoder().encode('export const fromArrayBuffer = 1\n').buffer, format: 'module' }
  }))
  assert.deepEqual(exports.sort(), ['fromArrayBuffer', 'fromBuffer', 'fromUint8'])
}

// mapImport controls the emitted imports; registration keeps the canonical url.
{
  const calls = []
  const mapImport = (url, kind) => {
    calls.push([url, kind])
    return kind === 'runtime' ? 'mapped-runtime' : 'mapped-module'
  }
  const { code, imports } = await wrap('export const a = 1\n', virtualGraph({}), { mapImport })
  assert.deepEqual(imports, ['mapped-runtime', 'mapped-module'])
  assert.ok(code.includes(`register(${JSON.stringify(rootUrl)}`))
  // One sync and one async generation.
  const once = [[runtimeUrl, 'runtime'], [rootUrl, 'module']]
  assert.deepEqual(calls.filter(([, kind]) => kind === 'runtime'), [once[0], once[0]])
  assert.deepEqual(calls.filter(([, kind]) => kind === 'module'), [once[1], once[1]])
}

// Mapped specifiers are escaped, so the lexer decodes the exact strings.
{
  const moduleSpecifier = './we"ird\\path\n\'.js'
  const runtimeSpecifier = 'rt"\\.js'
  const mapImport = (url, kind) => kind === 'runtime' ? runtimeSpecifier : moduleSpecifier
  const { imports } = await wrap('export const a = 1\n', virtualGraph({}), { mapImport })
  assert.deepEqual(imports, [runtimeSpecifier, moduleSpecifier])
}

// Each call analyses the graph afresh: no state is shared between calls with
// the same root url.
{
  const files = { 'dep.mjs': 'export const a = 1\n' }
  const first = await wrap("export * from './dep.mjs'\n", virtualGraph(files))
  assert.deepEqual(first.exports, ['a'])
  files['dep.mjs'] = 'export const b = 1\n'
  const second = await wrap("export * from './dep.mjs'\n", virtualGraph(files))
  assert.deepEqual(second.exports, ['b'])

  assert.deepEqual((await wrap('export const before = 1\n', virtualGraph({}))).exports, ['before'])
  assert.deepEqual((await wrap('export const after = 1\n', virtualGraph({}))).exports, ['after'])
}

// A larger mixed graph produces identical code in both modes (checked by wrap).
{
  const graph = virtualGraph({
    'esm.mjs': "export * from './shared.mjs'\nexport { x as \"x-y\" } from './leaf.mjs'\nexport default 1\n",
    'other.mjs': "export * from './shared.mjs'\nexport const dup = 2\n",
    'shared.mjs': 'export const same = 1\n',
    'leaf.mjs': 'export const x = 1\n',
    'lib.cjs': "module.exports = require('./inner.cjs')\n",
    'inner.cjs': 'exports.inner = 1\n',
    'dup.mjs': 'export const dup = 1\n'
  }, { 'node:events': { url: 'node:events', format: 'builtin' } })
  const { exports } = await wrap([
    "export * from './esm.mjs'",
    "export * from './other.mjs'",
    "export * from './lib.cjs'",
    "export * from './dup.mjs'",
    "export * from 'node:events'",
    'export const own = 1',
    ''
  ].join('\n'), graph, { mapImport: (url) => `${url}?original` })
  for (const name of ['same', 'x-y', 'inner', 'own', 'EventEmitter']) assert.ok(exports.includes(name), name)
  assert.ok(!exports.includes('dup'))
  assert.ok(!exports.includes('default'))
}
