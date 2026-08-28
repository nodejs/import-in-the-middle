import { register, supportsSyncHooks } from '../../register-hooks.mjs'
import Hook from '../../index.js'
import { strictEqual } from 'node:assert'

if (!supportsSyncHooks()) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: synchronous hooks unsupported on this Node.js`)
  process.exit(0)
}

register()

let sawSameSource = false
let sawNested = false
let moduleExportsStarExports
let moduleExportsCjsStarExports
let moduleExportsNullStarExports
let moduleExportsUndefinedStarExports
let ambiguousRepeatedExports
let ambiguousThirdExports

// eslint-disable-next-line no-new
new Hook((exports, name) => {
  if (typeof name === 'string' && name.includes('reexport-same-source.mjs')) {
    sawSameSource = true
    strictEqual(exports.val, 1)
  }
  if (typeof name === 'string' && name.includes('reexport-nested-top.mjs')) {
    sawNested = true
    strictEqual(exports.nested, 42)
  }
  if (typeof name === 'string' && name.includes('duplicate-a.mjs')) {
    exports.foo = 'hooked'
  }
  if (typeof name === 'string' && name.includes('module-exports-star.mjs')) {
    moduleExportsStarExports = exports
  }
  if (typeof name === 'string' && name.includes('module-exports-cjs-star.mjs')) {
    moduleExportsCjsStarExports = exports
  }
  if (typeof name === 'string' && name.includes('module-exports-null-star.mjs')) {
    moduleExportsNullStarExports = exports
  }
  if (typeof name === 'string' && name.includes('module-exports-undefined-star.mjs')) {
    moduleExportsUndefinedStarExports = exports
  }
  if (typeof name === 'string' && name.includes('reexport-ambiguous-repeated.mjs')) {
    ambiguousRepeatedExports = exports
  }
  if (typeof name === 'string' && name.includes('reexport-ambiguous-third.mjs')) {
    ambiguousThirdExports = exports
  }
})

const lib = await import('../fixtures/reexport-same-source.mjs')
const nested = await import('../fixtures/reexport-nested-top.mjs')
const repeated = await import('../fixtures/reexport-repeated-same.mjs')
const ambiguousRepeated = await import('../fixtures/reexport-ambiguous-repeated.mjs')
const ambiguousThird = await import('../fixtures/reexport-ambiguous-third.mjs')
const moduleExportsStar = await import('../fixtures/module-exports-star.mjs')
const moduleExportsCjsStar = await import('../fixtures/module-exports-cjs-star.mjs')
const moduleExportsNullStar = await import('../fixtures/module-exports-null-star.mjs')
const moduleExportsUndefinedStar = await import('../fixtures/module-exports-undefined-star.mjs')

strictEqual(sawSameSource, true)
strictEqual(lib.val, 1)
strictEqual(sawNested, true)
strictEqual(nested.nested, 42)
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
} else {
  strictEqual('module.exports' in moduleExportsCjsStar, false)
  strictEqual('module.exports' in moduleExportsCjsStarExports, false)
}
strictEqual(repeated.foo, 'hooked')
