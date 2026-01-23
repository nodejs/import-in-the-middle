import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

// Upstream loader that returns a TypedArray `source` for JS modules, to emulate
// loaders that transform code and return BufferSource.
export async function load (url, context, parentLoad) {
  if (typeof url === 'string' && url.startsWith('file:') && (url.endsWith('.mjs') || url.endsWith('.js'))) {
    const path = fileURLToPath(url)
    const src = readFileSync(path, 'utf8')
    const buf = Buffer.from(src, 'utf8')
    const format = url.endsWith('.mjs') ? 'module' : 'commonjs'
    return { format, source: buf, shortCircuit: true }
  }
  return parentLoad(url, context)
}
