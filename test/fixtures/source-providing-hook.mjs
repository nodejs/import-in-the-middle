// A minimal loader hook that provides source for CJS modules.
// This mimics the behavior of @apm-js-collab/tracing-hooks which reads and
// potentially transforms CJS source. On Node 22+, providing source for CJS
// modules via hooks changes the require() behavior inside those modules,
// breaking require() of packages with "module-sync" exports conditions.
import { readFile } from 'node:fs/promises'

export async function load (url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (result.format === 'commonjs' && result.source == null && url.startsWith('file:')) {
    try {
      const parsedUrl = new URL(result.responseURL ?? url)
      result.source = await readFile(parsedUrl)
    } catch {}
  }
  return result
}
