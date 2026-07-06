// Unit-tests the ModuleBinder that generated wrappers use. The wrapper boilerplate
// (seed export value, expose set/get, defer TDZ reads) lives here as real code
// rather than emitted per wrapper, so it is exercised directly instead of only
// through the full loader.

import { createRequire } from 'module'
import { strictEqual, deepStrictEqual, throws } from 'assert'

const require = createRequire(import.meta.url)
const { ModuleBinder } = require('../../lib/register.js')

// A wrapper models each export as a local binding plus write/read closures over
// it; mimic one here.
function makeSlot (initial) {
  const slot = { value: initial }
  return {
    slot,
    write: (value) => { slot.value = value },
    read: () => slot.value
  }
}

// bind seeds the current source value into the export and the module object.
{
  const binder = new ModuleBinder()
  const source = { foo: 42 }
  const { slot, write, read } = makeSlot(undefined)
  binder.bind('foo', source, write, read, false)
  strictEqual(slot.value, 42, 'bind seeds the export binding')
  strictEqual(binder.namespace.foo, 42, 'bind seeds the module object')
  strictEqual(binder.get.foo(), 42, 'get returns the current value')
}

// A hook writing through set overrides the value and wins over later updates.
{
  const binder = new ModuleBinder()
  const source = { foo: 42 }
  const { slot, write, read } = makeSlot(undefined)
  binder.bind('foo', source, write, read, false)
  strictEqual(binder.set.foo(99), true, 'set returns true')
  strictEqual(slot.value, 99, 'set overrides the export binding')
  binder.flush()
  strictEqual(slot.value, 99, 'flush does not clobber an overridden value')
}

// useFallback reads source.default when the named export is missing.
{
  const binder = new ModuleBinder()
  const source = { default: 7 }
  const { slot, write, read } = makeSlot(undefined)
  binder.bind('module.exports', source, write, read, true)
  strictEqual(slot.value, 7, 'useFallback falls back to source.default')
}

// A value that is undefined at bind time is retried on the microtask once the
// source provides it (the circular-import / TDZ path).
{
  const binder = new ModuleBinder()
  const source = {}
  const { slot, write, read } = makeSlot(undefined)
  binder.bind('foo', source, write, read, false)
  strictEqual(slot.value, undefined, 'no value yet')
  source.foo = 5
  binder.flush()
  await Promise.resolve()
  strictEqual(slot.value, 5, 'pending value resolved on flush microtask')
}

// A ReferenceError from the source read (TDZ) defers rather than throwing.
{
  const binder = new ModuleBinder()
  let live = false
  const source = { get foo () { if (!live) throw new ReferenceError('tdz'); return 8 } }
  const { slot, write, read } = makeSlot(undefined)
  binder.bind('foo', source, write, read, false)
  strictEqual(slot.value, undefined, 'TDZ read deferred, no throw')
  live = true
  binder.flush()
  await Promise.resolve()
  strictEqual(slot.value, 8, 'deferred TDZ value resolved after it became live')
}

// Two binders keep independent state (set/get/namespace are per instance).
{
  const a = new ModuleBinder()
  const b = new ModuleBinder()
  a.bind('foo', { foo: 1 }, () => {}, () => 1, false)
  b.bind('bar', { bar: 2 }, () => {}, () => 2, false)
  deepStrictEqual(Object.keys(a.set), ['foo'])
  deepStrictEqual(Object.keys(b.set), ['bar'])
}

// A source still in its dead zone on the retry read keeps the updater pending
// (ReferenceError from the retried read is swallowed), then resolves.
{
  const binder = new ModuleBinder()
  let stage = 0
  const source = {
    get foo () {
      // Throw at bind time and on the first flush; resolve afterwards.
      if (stage++ < 2) throw new ReferenceError('tdz')
      return 11
    }
  }
  const { slot, write, read } = makeSlot(undefined)
  binder.bind('foo', source, write, read, false)
  strictEqual(slot.value, undefined, 'still deferred after bind')
  binder.flush()
  await Promise.resolve()
  strictEqual(slot.value, undefined, 'still deferred after first flush attempt')
  await new Promise((resolve) => setTimeout(resolve, 20))
  strictEqual(slot.value, 11, 'resolved on a later retry once live')
}

// A non-ReferenceError thrown while seeding at bind time propagates.
{
  const binder = new ModuleBinder()
  const source = { get foo () { throw new TypeError('boom') } }
  const { write, read } = makeSlot(undefined)
  throws(() => binder.bind('foo', source, write, read, false), TypeError)
}
