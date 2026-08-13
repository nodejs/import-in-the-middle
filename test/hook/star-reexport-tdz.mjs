import * as top from '../fixtures/star-reexport-tdz-top.mjs'
import { strictEqual } from 'assert'
import Hook from '../../index.js'

// Regression test for issue #269 (typebox's exports coming back `undefined`
// under the loader).
//
// `Foo`/`IsFoo` are function declarations defined in the leaf module and
// re-exported through a barrel with `export *`. A circular `export *` loop
// (barrel -> leaf -> barrel) makes the barrel's wrapper evaluate while the leaf
// is still in its temporal dead zone, so the wrapper snapshots the bindings as
// `undefined`. Without the loader these are always functions (hoisted
// declarations, live bindings), so the loader must expose them the same way and
// not lose them to a deferred read that only recovers on a later async retry.
Hook(() => {})

strictEqual(typeof top.Foo, 'function')
strictEqual(typeof top.IsFoo, 'function')
strictEqual(typeof top.useFoo, 'function')
