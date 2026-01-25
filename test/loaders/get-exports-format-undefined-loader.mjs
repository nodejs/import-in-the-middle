// Deterministic test loader that composes the normal IITM test harness loader
// with a "buggy upstream loader" behavior: when IITM reads module source to
// detect exports (internal parentLoad call while loading an `?iitm=true` wrapper),
// return the same source but with `format: undefined`.
//
// This lets us exercise lib/get-exports.mjs fallback logic without ever returning
// an invalid format to Node for *real* module execution.

import * as base from '../generic-loader.mjs'

const targets = [
  '/test/fixtures/something.mjs',
  '/test/fixtures/side-effect-only.mjs',
  '/test/fixtures/something.js',
  '/test/fixtures/no-exports-import-meta.mjs',
  '/test/fixtures/no-exports-import-scanner-branches.mjs'
]

export const initialize = base.initialize
export const resolve = base.resolve
export const getFormat = base.getFormat
export const getSource = base.getSource

export async function load (url, context, parentLoad) {
  // Only tamper with IITM's internal export-detection reads, which happen while
  // loading an `?iitm=true` wrapper module.
  if (typeof url === 'string' && url.includes('iitm=true')) {
    async function parentLoadDropFormat (u, ctx) {
      const res = await parentLoad(u, ctx)
      if (
        typeof u === 'string' &&
        targets.some((t) => u.includes(t)) &&
        res &&
        typeof res === 'object' &&
        (res.format === 'module' || res.format === 'commonjs')
      ) {
        return { ...res, format: undefined }
      }
      return res
    }

    return base.load(url, context, parentLoadDropFormat)
  }

  return base.load(url, context, parentLoad)
}
