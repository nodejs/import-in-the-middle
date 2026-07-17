import { createHook } from '../fixtures/inspectable-create-hook.mjs'

// Loader used ONLY by `test/hook/specifiers-map-cleanup.mjs` (which is skipped on Node 18.0–18.18).
// Keeping this file outside of `test/hook/` avoids having the test runner execute it directly.

const meta = { url: new URL('../../hook.mjs', import.meta.url).href }
const { initialize, load, resolve, specifiers } = createHook(meta)

process.on('exit', () => {
  if (specifiers.size !== 0) {
    // eslint-disable-next-line no-console
    console.error(`specifiers map leak detected: size=${specifiers.size}`)
    process.exitCode = 1
  }
})

export { initialize, load, resolve }
