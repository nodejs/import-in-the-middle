import { strictEqual } from 'assert'
import Hook from '../../index.js'
Hook((exports, name) => {
  if (/bundle\.mjs/.test(name) === false) return

  const bar = exports.default
  exports.default = function wrappedBar() {
    return bar() + '-wrapped'
  }

  const sayName = exports.sayName
  exports.sayName = function wrappedSayName() {
    return `Bastion: "${sayName()}"`
  }
})

import { default as bar, sayName } from '../fixtures/bundle.mjs'

strictEqual(bar(), '42-wrapped')
strictEqual(sayName(), 'Bastion: "Moon Child"')
