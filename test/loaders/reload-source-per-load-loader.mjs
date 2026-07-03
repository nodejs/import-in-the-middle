// Upstream loader that returns different source on each `load()` call for one
// virtual module. A transform or codegen loader that is not idempotent (or that
// keys off `context`) behaves like this: every real load must run through it
// again. IITM reads a module's source once to lex its exports and then emits a
// wrapper that does `import * as namespace from <realUrl>`; that namespace
// import must reach this loader a second time rather than replay the source the
// export scan already read. The counter makes a skipped second call observable:
// the export scan sees `1`, the real load must see `2`.

const RELOAD_URL = new URL('file:///virtual/reload-source-per-load.mjs').href

let loadCount = 0

export async function resolve (specifier, context, parentResolve) {
  if (specifier === 'virtual-reload-source-per-load') {
    return { url: RELOAD_URL, format: 'module', shortCircuit: true }
  }
  // IITM's generated wrapper imports the resolved file URL directly; keep this
  // synthetic URL from hitting Node's default resolver.
  if (specifier === RELOAD_URL) {
    return { url: specifier, format: 'module', shortCircuit: true }
  }
  return parentResolve(specifier, context)
}

export async function load (url, context, parentLoad) {
  if (url === RELOAD_URL) {
    loadCount += 1
    return { format: 'module', source: `export const value = ${loadCount}\n`, shortCircuit: true }
  }
  return parentLoad(url, context)
}
