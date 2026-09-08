// Unit-tests the ModuleBinder that generated wrappers use. The wrapper boilerplate
// (seed export values, apply hook writes, defer TDZ reads) lives here as real code
// rather than emitted per wrapper, so it is exercised directly instead of only
// through the full loader.

import { createRequire } from 'module'
import { strictEqual, throws } from 'assert'

const require = createRequire(import.meta.url)
const { ModuleBinder } = require('../../lib/register.js')

/**
 * @param {object} source The wrapped module namespace.
 * @param {string} [key] Its export name.
 * @param {object[]} [sources] Alternate namespaces in wrapper-binding order.
 */
function makeBinder (source, key = 'foo', sources) {
  const slot = { value: undefined }
  /**
   * @param {number} index The wrapper binding index.
   * @param {unknown} value The export value.
   */
  function write (index, value) {
    strictEqual(index, 0)
    slot.value = value
  }
  return { binder: new ModuleBinder(source, [key], write, sources), slot }
}

/**
 * @returns {{ callbacks: Array<() => void>, restore: () => void }}
 */
function interceptTimeouts () {
  const callbacks = []
  const originalSetTimeout = globalThis.setTimeout
  /** @param {() => void} callback */
  globalThis.setTimeout = (callback) => {
    callbacks.push(callback)
    return { unref () {} }
  }
  return {
    callbacks,
    restore () {
      globalThis.setTimeout = originalSetTimeout
    }
  }
}

// Construction seeds the current source value into the export and module object.
{
  const source = { foo: 42 }
  const { binder, slot } = makeBinder(source)
  strictEqual(slot.value, 42, 'construction seeds the export binding')
  strictEqual(binder.namespace.foo, 42, 'construction seeds the module object')
}

// A hook writing through set overrides the value and wins over later updates.
{
  const source = { foo: 42 }
  const { binder, slot } = makeBinder(source)
  strictEqual(binder.write('foo', 99), true, 'write returns true')
  strictEqual(slot.value, 99, 'set overrides the export binding')
  binder.flush()
  strictEqual(slot.value, 99, 'flush does not clobber an overridden value')
}

// Read-only bindings retain the source value and ignore hook writes.
{
  const source = { foo: 42 }
  const binder = new ModuleBinder(source, undefined, undefined, undefined, ['foo'])
  strictEqual(binder.namespace.foo, 42)
  strictEqual(binder.write('foo', 99), true)
  strictEqual(binder.namespace.foo, 42)
  source.foo = 43
  strictEqual(binder.namespace.foo, 43)
}

// Read-only bindings can use the defining namespace for star re-exports.
{
  const source = { foo: 1 }
  const definingSource = { foo: 2 }
  const binder = new ModuleBinder(source, undefined, undefined, undefined, ['foo'], [definingSource])
  strictEqual(binder.namespace.foo, 2)
}

// useFallback reads source.default when the named export is missing.
{
  const source = { default: 7 }
  const { slot } = makeBinder(source, 'module.exports')
  strictEqual(slot.value, 7, 'module.exports falls back to source.default')
}

// A value that is undefined at bind time is retried on the microtask once the
// source provides it (the circular-import / TDZ path).
{
  const source = {}
  const { binder, slot } = makeBinder(source)
  strictEqual(slot.value, undefined, 'no value yet')
  source.foo = 5
  binder.flush()
  await Promise.resolve()
  strictEqual(slot.value, 5, 'pending value resolved on flush microtask')
}

// A ReferenceError from the source read (TDZ) defers rather than throwing.
{
  let live = false
  const source = { get foo () { if (!live) throw new ReferenceError('tdz'); return 8 } }
  const { binder, slot } = makeBinder(source)
  strictEqual(slot.value, undefined, 'TDZ read deferred, no throw')
  live = true
  binder.flush()
  await Promise.resolve()
  strictEqual(slot.value, 8, 'deferred TDZ value resolved after it became live')
}

// Two binders keep independent state.
{
  const { binder: a } = makeBinder({ foo: 1 })
  const { binder: b } = makeBinder({ bar: 2 }, 'bar')
  a.write('foo', 3)
  strictEqual(a.namespace.foo, 3)
  strictEqual(b.namespace.bar, 2)
}

// A source still in its dead zone on the retry read keeps the updater pending
// (ReferenceError from the retried read is swallowed), then resolves.
{
  const { callbacks, restore } = interceptTimeouts()
  try {
    let stage = 0
    const source = {
      get foo () {
        // Throw at bind time and on the first flush; resolve afterwards.
        if (stage++ < 2) throw new ReferenceError('tdz')
        return 11
      }
    }
    const { binder, slot } = makeBinder(source)
    strictEqual(slot.value, undefined, 'still deferred after bind')
    binder.flush()
    await Promise.resolve()
    strictEqual(slot.value, undefined, 'still deferred after first flush attempt')
    callbacks.shift()()
    strictEqual(slot.value, 11, 'resolved on a later retry once live')
  } finally {
    restore()
  }
}

// A non-ReferenceError thrown while seeding at bind time propagates.
{
  const source = { get foo () { throw new TypeError('boom') } }
  throws(() => makeBinder(source), TypeError)
}

{
  const source = {}
  const { binder, slot } = makeBinder(source)
  source.foo = 13
  binder.flush()
  binder.flush()
  await Promise.resolve()
  strictEqual(slot.value, 13, 'concurrent flushes share a resolved pending queue')
}

// Exhausting every retry releases the pending updater and later flushes stay
// inactive, even if the source eventually gets a value.
{
  const { callbacks, restore } = interceptTimeouts()
  try {
    const source = {}
    const { binder, slot } = makeBinder(source)
    binder.flush()
    await Promise.resolve()
    while (callbacks.length > 0) callbacks.shift()()

    source.foo = 13
    binder.flush()
    await Promise.resolve()
    strictEqual(slot.value, undefined, 'exhausted updater is not retried')
  } finally {
    restore()
  }
}
