import { addHook } from '../../index.js'
import { Report } from 'c8'
import { strictEqual } from 'assert'
let specifier

addHook(function (name, namespace, specifierParam ) {
  if (name.includes('c8/index.js')) {
    specifier = specifierParam
    namespace.Report = () => 42
  }
})

strictEqual(specifier, 'c8')
strictEqual(Report({}), 42)
