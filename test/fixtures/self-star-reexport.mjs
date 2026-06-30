// The exact shape from the original report: a module whose `export *` points at
// itself (https://github.com/platformatic/kafka/pull/191 removed an
// `export * from './index.ts'`). Without the cycle guard this re-enters
// processModule on the same URL forever.
export * from './self-star-reexport.mjs'

export const fromSelf = 1
