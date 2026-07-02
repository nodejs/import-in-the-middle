// A single leaf re-exported by two different barrels and also imported
// directly. Collecting the second barrel's exports hits the per-URL export
// memo for the leaf, and the leaf's namespace import is served from the source
// the export pass already read. Importing the leaf's bindings through both
// barrels makes the memoized re-export set observable: if the memo returned the
// wrong set for the second barrel, `shared`/`sharedFn` would not be re-exported
// there and these bindings would be missing.
import { shared, sharedFn } from '../fixtures/dedup-shared-leaf.mjs'
import { one, shared as sharedViaOne, sharedFn as sharedFnViaOne } from '../fixtures/dedup-barrel-one.mjs'
import { two, shared as sharedViaTwo, sharedFn as sharedFnViaTwo } from '../fixtures/dedup-barrel-two.mjs'
import Hook from '../../index.js'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.endsWith('fixtures/dedup-barrel-one.mjs')) {
    exports.one = exports.one + '-wrapped'
  }
  if (name.endsWith('fixtures/dedup-barrel-two.mjs')) {
    exports.two = exports.two + '-wrapped'
  }
})

strictEqual(shared, 'shared')
strictEqual(sharedFn(), 'sharedFn')
strictEqual(one, 'one-wrapped')
strictEqual(two, 'two-wrapped')

// The leaf's bindings are re-exported through both barrels. The second barrel
// reaches the leaf through the export memo; both still expose the leaf's
// exports.
strictEqual(sharedViaOne, 'shared')
strictEqual(sharedViaTwo, 'shared')
strictEqual(sharedFnViaOne(), 'sharedFn')
strictEqual(sharedFnViaTwo(), 'sharedFn')
