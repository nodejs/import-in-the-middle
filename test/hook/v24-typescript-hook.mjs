import { ok, strictEqual, deepStrictEqual } from 'assert'
import Hook from '../../index.js'

// Regression for https://github.com/nodejs/import-in-the-middle/issues/186.
// Under Node's type stripping the loader reports a module as 'module-typescript'
// / 'commonjs-typescript'; iitm did not recognise those formats, so `.ts`/`.mts`
// /`.cts` modules were silently left uninstrumented (they still loaded, but no
// hook ever fired).

let esmExports
let cjsExports

const hook = new Hook((exports, name) => {
  if (name.endsWith('typescript-hook.mts')) {
    esmExports = Object.keys(exports)
  } else if (name.endsWith('typescript-cjs-hook.cts')) {
    cjsExports = Object.keys(exports)
  }
})

const esm = await import('../fixtures/typescript-hook.mts')

// Types are stripped, so the runtime values load as usual.
strictEqual(esm.alpha, 1)
strictEqual(esm.beta, 'two')
strictEqual(esm.gamma(1), 2)
strictEqual(typeof esm.Delta, 'function')

// The hook fired, which means iitm wrapped the type-stripped module.
ok(esmExports, 'expected iitm to instrument the type-stripped .mts module')

// Every value export is captured (including `beta`, the second binding of a
// type-annotated multi-declarator), while type-only exports are excluded.
deepStrictEqual(
  esmExports.slice().sort(),
  ['Delta', 'alpha', 'beta', 'castAlpha', 'castBeta', 'gamma']
)

// The CommonJS sibling format ('commonjs-typescript') is wrapped the same way.
const cjs = await import('../fixtures/typescript-cjs-hook.cts')
strictEqual(cjs.default.epsilon, 5)
strictEqual(cjs.default.zeta({ kind: 'square' }), 'square')

ok(cjsExports, 'expected iitm to instrument the type-stripped .cts module')
deepStrictEqual(cjsExports.slice().sort(), ['default', 'epsilon', 'module.exports', 'zeta'])

hook.unhook()
