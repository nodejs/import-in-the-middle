// A barrel that re-exports the leaf's bindings with `export *`. This is the
// module whose wrapper snapshots `Foo`/`IsFoo` while they are still in the
// leaf's temporal dead zone (see star-reexport-tdz-leaf.mjs).
export * from './star-reexport-tdz-leaf.mjs'
