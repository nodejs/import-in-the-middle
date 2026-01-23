import { strictEqual } from 'assert'
import Hook from '../../index.js'

const seen = new Set()
const hook = new Hook((exports, name) => {
  if (typeof name !== 'string') return
  if (
    name.endsWith('/test/fixtures/side-effect-only.mjs') ||
    name.endsWith('/test/fixtures/no-exports-import-meta.mjs') ||
    name.endsWith('/test/fixtures/no-exports-import-scanner-branches.mjs')
  ) {
    seen.add(name)
  }
})

// Case 0: static import => treated as ESM. No default export should exist.
{
  const m = await import('./side-effect-only.mjs')
  strictEqual(Object.prototype.hasOwnProperty.call(m, 'default'), false)
}

// Case A: import.meta => should be treated as ESM. No default export should exist.
{
  const m = await import('./no-exports-import-meta.mjs')
  strictEqual(Object.prototype.hasOwnProperty.call(m, 'default'), false)
}

// Case B: strings/comments/dynamic-import-only => should be treated as "no ESM syntax".
// With unknown format, that means IITM will fall back to CJS export detection,
// which causes it to export a (possibly undefined) default.
{
  const m = await import('./no-exports-import-scanner-branches.mjs')
  strictEqual(Object.prototype.hasOwnProperty.call(m, 'default'), true)
  strictEqual(m.default, undefined)
}

strictEqual(seen.size, 3)
hook.unhook()
