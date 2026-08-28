import { strictEqual, ok } from 'assert'
import { createRequire } from 'module'
import { getExports, hasModuleExportsCJSDefault } from '../../lib/get-exports.mjs'
import { driveAsync } from '../../lib/io.mjs'

// getExports must use Object.getOwnPropertyNames (not Object.keys) so that
// NON-ENUMERABLE own properties of a Node built-in are still discovered.
//
// `node:events` is the EventEmitter constructor (a function), so `prototype`
// (and `name`/`length`) are always non-enumerable own properties on every
// supported Node version. We deliberately avoid the fs.F_OK/R_OK/... constants
// used previously: Node removed those deprecated top-level aliases in v25
// (DEP0176), so they no longer exist to assert against on Node >= 25.
//
// getExports is a "sans-io" generator (see lib/io.mjs); drive it with the async
// driver and a stub `load` that reports the module as a sourceless builtin,
// just as the off-thread loader's nextLoad does for built-in modules.
const require = createRequire(import.meta.url)
const builtin = 'node:events'
const moduleValue = require(builtin)
const enumerableNames = new Set(Object.keys(moduleValue))
const nonEnumerableNames = Object.getOwnPropertyNames(moduleValue)
  .filter((name) => !enumerableNames.has(name))

const io = { load: async () => ({ source: null, format: 'builtin' }) }

const { exportNames } = await driveAsync(getExports(builtin, { format: 'builtin' }), io)

// The whole point: non-enumerable own properties (e.g. `prototype`) that
// Object.keys would miss must still be discovered.
ok(nonEnumerableNames.length > 0, `precondition: ${builtin} has non-enumerable own properties`)
for (const name of nonEnumerableNames) {
  ok(exportNames.has(name), `non-enumerable ${name} should be in exports`)
}

// Sanity check: an enumerable export should still be present.
ok(exportNames.has('once'), 'enumerable export (once) should be in exports')
ok(exportNames.has('default'), 'default should be in exports')

// Node >= 23 adds `module.exports` as an alias for the default export in CJS modules
if (hasModuleExportsCJSDefault) {
  ok(exportNames.has('module.exports'), 'module.exports should be in exports on Node >= 23')
} else {
  ok(!exportNames.has('module.exports'), 'module.exports should not be in exports on Node < 23')
}

strictEqual(typeof exportNames.has, 'function', 'builtin exportNames should be a Set')

console.log('✅ getExports includes non-enumerable built-in module exports')
