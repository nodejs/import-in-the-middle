// The purpose of this fixture is to replicate a situation where we may
// end up exporting `default` twice: first from this script itself and second
// via the `export * from` line.
//
// This replicates the way the in-the-wild `got` module does things:
// https://github.com/sindresorhus/got/blob/3822412/source/index.ts

class got {
  foo = 'foo'
}

export default got
export { got }
export * from './something.mjs'
export * from './default-class.mjs'
export * from './snake_case.mjs'
export { default as renamedDefaultExport } from './lib/baz.mjs'
