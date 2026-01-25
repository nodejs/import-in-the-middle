// Upstream loader that returns invalid JS the first time a specific module is
// loaded. This simulates loaders/transforms that can temporarily return
// unparsable code, and is used to ensure IITM falls back gracefully when
// wrapping fails.

const WRAP_FAIL_URL = new URL('file:///virtual/wrap-failure.mjs').href

const loadCounts = new Map()

export async function resolve (specifier, context, parentResolve) {
  if (specifier === 'virtual-wrap-failure') {
    return { url: WRAP_FAIL_URL, format: 'module', shortCircuit: true }
  }
  // When IITM wraps the module, its generated wrapper will import the resolved
  // file URL directly. Avoid Node's default resolver trying to hit the
  // filesystem for these synthetic URLs.
  if (specifier === WRAP_FAIL_URL) {
    return { url: specifier, format: 'module', shortCircuit: true }
  }
  return parentResolve(specifier, context)
}

export async function load (url, context, parentLoad) {
  if (url === WRAP_FAIL_URL) {
    const next = (loadCounts.get(url) || 0) + 1
    loadCounts.set(url, next)
    if (next === 1) {
      // Invalid JS (forces IITM wrapping/parsing to fail).
      return { format: 'module', source: 'export const = 1\n', shortCircuit: true }
    }
    // Valid JS on subsequent loads so the app can proceed.
    return { format: 'module', source: 'export const ok = 1\n', shortCircuit: true }
  }

  return parentLoad(url, context)
}
