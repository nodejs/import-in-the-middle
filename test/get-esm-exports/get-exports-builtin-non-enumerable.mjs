import { strictEqual, ok } from 'assert'
import { getExports, hasModuleExportsCJSDefault } from '../../lib/get-exports.mjs'

// getExports should use Object.getOwnPropertyNames (not Object.keys) so that
// non-enumerable properties of Node built-in modules are included.
// fs.F_OK, R_OK, W_OK, X_OK are non-enumerable on require('fs') but are
// real exports that should be discoverable.
const mockParentLoad = async () => ({ source: null, format: 'builtin' })

const exports = await getExports('node:fs', { format: 'builtin' }, mockParentLoad)

ok(exports.has('F_OK'), 'F_OK (non-enumerable on require("fs")) should be in exports')
ok(exports.has('R_OK'), 'R_OK should be in exports')
ok(exports.has('W_OK'), 'W_OK should be in exports')
ok(exports.has('X_OK'), 'X_OK should be in exports')

// Sanity check: enumerable exports should still be present
ok(exports.has('readFile'), 'readFile should be in exports')
ok(exports.has('default'), 'default should be in exports')

// Node >= 23 adds `module.exports` as an alias for the default export in CJS modules
if (hasModuleExportsCJSDefault) {
  ok(exports.has('module.exports'), 'module.exports should be in exports on Node >= 23')
} else {
  ok(!exports.has('module.exports'), 'module.exports should not be in exports on Node < 23')
}

strictEqual(typeof exports.has, 'function', 'getExports should return a Set')

console.log('✅ getExports includes non-enumerable built-in module exports')
