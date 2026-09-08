import * as lib from '../fixtures/reexport-same-source.mjs'
import * as nested from '../fixtures/reexport-nested-top.mjs'
import { strictEqual } from 'assert'
import Hook from '../../index.js'

let moduleExportsStarExports
let moduleExportsCjsStarExports
let moduleExportsNullStarExports
let moduleExportsUndefinedStarExports
let ambiguousRepeatedExports
let ambiguousThirdExports

// `val` reaches the entry module through two `export *` chains that both bottom
// out at the same leaf module, so per ECMAScript ResolveExport it is one binding
// that stays exported and keeps its value (issue #171). The previous dedup
// dropped it as ambiguous; reading the value off the aggregate namespace then
// returned undefined because Node sees the two chains as distinct wrapper
// modules. The wrapper reads each re-exported binding from its defining module.
//
// `nested` exercises the same collision one level down: the entry module
// `export *`s a module that itself resolved the collision, so the alias minted
// there has to propagate up into this wrapper's imports.
Hook((exports, name) => {
  if (name.includes('reexport-same-source.mjs')) {
    strictEqual('val' in exports, true)
    strictEqual(exports.val, 1)
  }
  if (name.includes('reexport-nested-top.mjs')) {
    strictEqual('nested' in exports, true)
    strictEqual(exports.nested, 42)
  }
  if (name.includes('duplicate-a.mjs')) {
    exports.foo = 'hooked'
  }
  if (name.includes('module-exports-star.mjs')) {
    moduleExportsStarExports = exports
  }
  if (name.includes('module-exports-cjs-star.mjs')) {
    moduleExportsCjsStarExports = exports
  }
  if (name.includes('module-exports-null-star.mjs')) {
    moduleExportsNullStarExports = exports
  }
  if (name.includes('module-exports-undefined-star.mjs')) {
    moduleExportsUndefinedStarExports = exports
  }
  if (name.includes('reexport-ambiguous-repeated.mjs')) {
    ambiguousRepeatedExports = exports
  }
  if (name.includes('reexport-ambiguous-third.mjs')) {
    ambiguousThirdExports = exports
  }
})

strictEqual('val' in lib, true)
strictEqual(lib.val, 1)
strictEqual('nested' in nested, true)
strictEqual(nested.nested, 42)
strictEqual(nested.unique, 43)
strictEqual('default' in nested, false)

const ambiguous = await import('../fixtures/duplicate.mjs')
const explicit = await import('../fixtures/duplicate-explicit.mjs')
const override = await import('../fixtures/reexport-explicit-override.mjs')
const repeated = await import('../fixtures/reexport-repeated-same.mjs')
const ambiguousRepeated = await import('../fixtures/reexport-ambiguous-repeated.mjs')
const ambiguousThird = await import('../fixtures/reexport-ambiguous-third.mjs')
const moduleExportsStar = await import('../fixtures/module-exports-star.mjs')
const moduleExportsCjsStar = await import('../fixtures/module-exports-cjs-star.mjs')
const moduleExportsNullStar = await import('../fixtures/module-exports-null-star.mjs')
const moduleExportsUndefinedStar = await import('../fixtures/module-exports-undefined-star.mjs')

strictEqual('foo' in ambiguous, false)
strictEqual(explicit.foo, 'c')
strictEqual(override.foo, 'c')
strictEqual('foo' in ambiguousRepeated, false)
strictEqual('foo' in ambiguousRepeatedExports, false)
strictEqual('foo' in ambiguousThird, false)
strictEqual('foo' in ambiguousThirdExports, false)
strictEqual(typeof moduleExportsStar['module.exports'], 'function')
strictEqual(typeof moduleExportsStarExports['module.exports'], 'function')
strictEqual(moduleExportsNullStar['module.exports'], null)
strictEqual(moduleExportsNullStarExports['module.exports'], null)
strictEqual('module.exports' in moduleExportsUndefinedStar, true)
strictEqual(moduleExportsUndefinedStar['module.exports'], undefined)
strictEqual('module.exports' in moduleExportsUndefinedStarExports, true)
strictEqual(moduleExportsUndefinedStarExports['module.exports'], undefined)
if (parseInt(process.versions.node, 10) >= 23) {
  strictEqual(typeof moduleExportsCjsStar['module.exports'], 'function')
  strictEqual(typeof moduleExportsCjsStarExports['module.exports'], 'function')
}
strictEqual(repeated.foo, 'hooked')
