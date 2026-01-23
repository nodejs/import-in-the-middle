/* eslint-disable */

import { register } from 'module'
import Hook from '../../index.js'

if (true) {
  // Background: This works. A typical case of hooking top-level import of a module.
  register('../../hook.mjs', import.meta.url);
  Hook(['c8'], (exports, name, baseDir) => {
    console.log('HIT: name=%s, baseDir=%s', name, baseDir)
  })
  await import('c8')

} else if (true) {
  // The issue: If a user imports the module "main" file **by referring to its
  // internal implementation file**, then IITM doesn't hook it.
  register('../../hook.mjs', import.meta.url);
  Hook(['c8'], (exports, name, baseDir) => {
    console.log('HIT: name=%s, baseDir=%s', name, baseDir) // <--- This isn't hit.
  })
  await import('c8/index.js') // <--- This changed.

} else if (true) {
  // The workaround: `experimentalPatchInternals`
  // (from https://github.com/nodejs/import-in-the-middle/pull/194)
  register('../../hook.mjs', import.meta.url, { data: { experimentalPatchInternals: true } })
  Hook(['c8'], (exports, name, baseDir) => {
    console.log('HIT: name=%s, baseDir=%s', name, baseDir) // <--- This hits now, with name==`c8`.
  })
  await import('c8/index.js')

} else if (true) {
  // The problem with the workaround: Watch what happens with
  // `experimentalPatchInternals: true` and a package that:
  // (a) is type=module
  // (b) has multiple files
  // (c) does not use `"exports"` so we *can* import the "main" implementation file path
  //
  // *Every* file loaded in the package is matched by IITM, and with
  // `name === "<the module name>".
  //
  // Given:
  //     node_modules/an-esm-module-not-using-exports-field/
  //       package.json
  //           {
  //             "type": "module",
  //             "main": "./index.js"
  //           }
  //       index.js
  //           export * from './lib/foo.js';
  //           export * from './lib/bar.js';
  //       lib/foo.js:
  //           export const fooVar = 1;
  //       lib/bar.js:
  //           export const barVar = 2;
  register('../../hook.mjs', import.meta.url, { data: { experimentalPatchInternals: true } })
  Hook(['an-esm-module-not-using-exports-field'], (exports, name, baseDir) => {
    console.log('HIT: name=%s', name, exports)
  })
  await import('an-esm-module-not-using-exports-field/index.js')

  // The result is:
  //       HIT: name=an-esm-module-not-using-exports-field [Object: null prototype] [Module] { fooVar: 1 }
  //       HIT: name=an-esm-module-not-using-exports-field [Object: null prototype] [Module] { barVar: 2 }
  //       HIT: name=an-esm-module-not-using-exports-field [Object: null prototype] [Module] { fooVar: 1, barVar: 2 }
  // 1. Returning a match for every file in the package is what `internals:
  //    true` is for.
  // 2. This is worse because the `name` cannot be used to distinguish the
  //    actual loaded file.
  //
  // The reason this problem wasn't see in the PR is because the tested
  // package `c8` is type=commonjs.

} else if (true) {
  // Using `internals: true`, the result is:
  //     HIT: name=an-esm-module-not-using-exports-field/lib/foo.js
  //     HIT: name=an-esm-module-not-using-exports-field/lib/bar.js
  //     HIT: name=an-esm-module-not-using-exports-field/index.js
  register('../../hook.mjs', import.meta.url)
  Hook(['an-esm-module-not-using-exports-field'], {internals: true}, (exports, name, baseDir) => {
    console.log('HIT: name=%s', name)
  })
  await import('an-esm-module-not-using-exports-field/index.js')
}

