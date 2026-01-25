// Upstream loader that drops `format` (keeps `source`) *only* for IITM's internal
// wrapping path. This simulates buggy loaders while keeping the overall load()
// contract valid for the actual module execution.

const targets = [
  '/test/fixtures/something.mjs',
  '/test/fixtures/side-effect-only.mjs',
  '/test/fixtures/something.js'
]

export async function load (url, context, parentLoad) {
  const res = await parentLoad(url, context)

  // Never interfere with IITM wrapper modules themselves.
  if (typeof url === 'string' && url.includes('iitm=true')) {
    return res
  }

  // Only affect IITM's internal "read module source for wrapping" call.
  // When IITM wraps a module, the wrapper module URL contains `?iitm=true`.
  // The *actual* execution load of the real module will have parentURL pointing
  // at that wrapper, and must keep a valid format.
  const parentURL = typeof context?.parentURL === 'string' ? context.parentURL : ''
  const isExecutingFromWrapper = parentURL.includes('iitm=true')

  if (
    typeof url === 'string' &&
    targets.some((t) => url.includes(t)) &&
    !isExecutingFromWrapper &&
    res &&
    typeof res === 'object' &&
    (res.format === 'module' || res.format === 'commonjs')
  ) {
    return { ...res, format: undefined }
  }

  return res
}
