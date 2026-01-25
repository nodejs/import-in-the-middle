// Loader that resolves a synthetic specifier to a file URL that parses but
// causes fileURLToPath() to throw (URI malformed). This is used to exercise
// IITM's defensive fileURLToPath() try/catch in index.js without calling
// internal APIs.

const BAD_FILE_URL = 'file:///%'
const NORMALIZED_BAD_FILE_URL = new URL(BAD_FILE_URL).href // -> file:///%

export async function resolve (specifier, context, parentResolve) {
  if (specifier === 'virtual-bad-fileurl') {
    return {
      url: NORMALIZED_BAD_FILE_URL,
      format: 'module',
      shortCircuit: true
    }
  }
  // When IITM wraps the module, its generated wrapper will import the resolved
  // URL directly. Ensure Node's default resolver never touches the malformed
  // file URL (it would throw URIError).
  if (specifier === BAD_FILE_URL || specifier === NORMALIZED_BAD_FILE_URL) {
    return {
      url: NORMALIZED_BAD_FILE_URL,
      format: 'module',
      shortCircuit: true
    }
  }
  return parentResolve(specifier, context)
}

export async function load (url, context, parentLoad) {
  if (url === NORMALIZED_BAD_FILE_URL) {
    return {
      format: 'module',
      source: 'export const foo = 1\n',
      shortCircuit: true
    }
  }
  return parentLoad(url, context)
}
