import { strictEqual } from 'assert'
import Hook from '../../index.js'

// The upstream loader returns `export const value = 1` the first time the module
// is read (IITM's export scan) and `2` on the next read (the real load the
// wrapper's namespace import triggers). If IITM replays the scan's source for
// the real load, both the executed module and the hooked namespace see `1`.
let hookedValue

const hook = new Hook((exports, name) => {
  if (typeof name === 'string' && name.endsWith('reload-source-per-load.mjs')) {
    hookedValue = exports.value
  }
})

// @ts-expect-error - resolved by the upstream loader
const namespace = await import('virtual-reload-source-per-load')

strictEqual(namespace.value, 2, 'module must execute the source its real load produced, not the export scan source')
strictEqual(hookedValue, 2, 'the hook must observe the real-load source too')

hook.unhook()
