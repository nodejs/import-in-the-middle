import { addHook } from '../../index.js'
import { strictEqual } from 'assert'
let specifier

addHook(function (name, namespace, specifierParam ) {
  if (name.includes('something.mjs')) {
    specifier = specifierParam
  }
})

strictEqual(specifier, undefined)
;(async () => {
  const { foo } = await import('../fixtures/something.mjs')

  strictEqual(specifier, '../fixtures/something.mjs')
  strictEqual(foo, 42)
})()
