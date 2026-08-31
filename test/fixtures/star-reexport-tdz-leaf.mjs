// The leaf that *defines* the exports. It pulls in the barrel that re-exports
// it (`import * as`), which is what closes the circular `export *` loop:
// barrel -> leaf -> barrel. Because the barrel is reached again from here, it
// ends up deeper in the same strongly-connected component than this leaf and
// therefore evaluates *before* it, so the leaf's bindings are still in their
// temporal dead zone when the barrel's wrapper snapshots them (issue #269).
import * as barrel from './star-reexport-tdz-barrel.mjs'

export function Foo (value) {
  return value
}

// Reads the barrel namespace back so the circular dependency is genuine (once
// settled, `barrel.Foo` is this module's own `Foo`).
export function sameAsBarrel () {
  return barrel.Foo === Foo
}

export function IsFoo (value) {
  return typeof value === 'object'
}
