import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

// Wrap a CJS module too, so the specifiers cleanup is exercised on the CJS
// path as well as the ESM one below.
await import('./cjs-transitive-a.js')

const dir = await mkdtemp(join(tmpdir(), 'iitm-specifiers-'))

// Import lots of unique module URLs to stress the loader's internal specifier tracking.
// If `specifiers.delete(realUrl)` is missing, the map will retain one entry per module.
const COUNT = 2000

for (let i = 0; i < COUNT; i++) {
  const filename = join(dir, `m${i}.mjs`)
  await writeFile(filename, `export const n = ${i}\n`, 'utf8')
}

for (let i = 0; i < COUNT; i++) {
  const url = pathToFileURL(join(dir, `m${i}.mjs`)).href
  await import(url)
}

// Also cover the "failed loading" cleanup path (the catch block in `getSource()`):
// make `processModule()` throw by providing invalid module syntax.
// Note: avoid query params in file: URLs here. Older Node.js versions can
// normalize/strip them differently between resolve/load, which makes this test
// assert the wrong thing (a URL mismatch) instead of the real invariant.
Error.stackTraceLimit = 0
for (let i = 0; i < 100; i++) {
  const badFilename = join(dir, `bad-syntax-${i}.mjs`)
  await writeFile(badFilename, 'export const =\n', 'utf8')
  try {
    await import(pathToFileURL(badFilename).href)
  } catch {
    // Expected (SyntaxError). We only care that the loader cleans up `specifiers`.
  }
}
