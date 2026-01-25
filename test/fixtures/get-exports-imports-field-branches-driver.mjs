import { strictEqual } from 'assert'
import Hook from '../../index.js'

const seen = new Set()
const hook = new Hook((exports, name) => {
  if (typeof name === 'string' && name.includes('/test/fixtures/')) {
    seen.add(name)
  }
})

async function importDefault (p) {
  const m = await import(p)
  return m.default
}

// requireExport.node|default and string mapping paths
strictEqual(typeof (await importDefault('./reexport-imports-field.js')), 'function')
strictEqual((await importDefault('./specifier-string.js')).foo, 42)
strictEqual((await importDefault('./reexport-require-default-only.js')).a, 1)

// imports.node / imports.default branches
strictEqual(typeof (await importDefault('./reexport-imports-node-only.js')), 'function')
strictEqual((await importDefault('./reexport-imports-default-only.js')).a, 1)

// Dead-code reexports should not crash export-detection/wrapping.
strictEqual(typeof (await importDefault('./reexport-import-node-dead.js')), 'object')
strictEqual(typeof (await importDefault('./reexport-import-default-dead.js')), 'object')

strictEqual(seen.size >= 6, true)
hook.unhook()
