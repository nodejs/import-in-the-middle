// The entry aggregator. `enter` comes first so the leaf is entered before the
// barrel; the barrel then contributes `Foo`/`IsFoo` through its `export *`.
// Mirrors typebox's `type/index.js`, which `export *`s several barrels where a
// deeply cross-imported leaf (`template_literal`) surfaces as `undefined`.
export * from './star-reexport-tdz-enter.mjs'
export * from './star-reexport-tdz-barrel.mjs'
