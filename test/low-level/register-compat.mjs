import { createRequire } from 'module'
import { strictEqual, throws } from 'assert'

const require = createRequire(import.meta.url)
const { importHooks, register, specifiers } = require('../../lib/register.js')

let value = 42
let legacyExports

/** @param {unknown} nextValue The replacement export value. */
function setValue (nextValue) {
  value = nextValue
  return true
}

function getValue () {
  return value
}

/**
 * @param {string} name The module URL.
 * @param {object} exports The intercepted exports.
 * @param {string} specifier The original import specifier.
 */
function onImport (name, exports, specifier) {
  strictEqual(name, 'file:///legacy.mjs')
  strictEqual(specifier, 'legacy')
  legacyExports = exports
}

importHooks.push(onImport)
try {
  const namespace = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } })
  namespace.foo = value
  register('file:///legacy.mjs', namespace, { foo: setValue }, { foo: getValue }, 'legacy')

  strictEqual(specifiers.get('file:///legacy.mjs'), 'legacy')
  strictEqual(legacyExports.foo, 42)
  strictEqual(legacyExports[Symbol.toStringTag], 'Module')
  strictEqual(Reflect.set(legacyExports, 'foo', 43), true)
  strictEqual(legacyExports.foo, 43)
  strictEqual(Reflect.defineProperty(legacyExports, 'foo', { value: 44 }), true)
  strictEqual(legacyExports.foo, 44)
  strictEqual(Reflect.set(legacyExports, 'missing', 1), true)
  strictEqual(legacyExports.missing, undefined)
  throws(
    () => Object.defineProperty(legacyExports, 'foo', { get: getValue }),
    /Getters\/setters are not supported/
  )
} finally {
  importHooks.pop()
}
