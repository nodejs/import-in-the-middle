import Hook from '../../index.js'
import defaultImportExport from '../fixtures/import-default-export.mjs'
import varDefaultExport from '../fixtures/variable-default-export.mjs'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.match(/import-default-export\.m?js/)) {
    const orig = exports.default
    exports.default = function () {
      return orig() + 1
    }
  } else if (name.match(/variable-default-export\.m?js/)) {
    const orig2 = exports.default
    exports.default = function () {
      return orig2() + 1
    }
  }
})

strictEqual(defaultImportExport(), 2)
strictEqual(varDefaultExport(), 2)