import { legacyRegister } from './cross-copy-registry-preload.mjs'

export let foo = 'legacy'

/** @param {string} value The replacement export. */
function setFoo (value) {
  foo = value
  return true
}

function getFoo () {
  return foo
}

const namespace = Object.create(null, { foo: { value: foo, enumerable: true, writable: true } })
legacyRegister(import.meta.url, namespace, { foo: setFoo }, { foo: getFoo }, import.meta.url)
