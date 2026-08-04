#!/usr/bin/env node
'use strict'

if (this !== exports) {
  throw new Error('top-level this must be exports')
}

if (arguments.length !== 5 || arguments[0] !== exports || arguments[2] !== module) {
  throw new Error('CommonJS wrapper arguments changed')
}

module.exports = {
  argumentExports: arguments[0],
  topLevelThis: this,
  value: 42
}

/* eslint-disable n/no-exports-assign, no-global-assign */
exports = undefined
require = undefined
module = undefined
__filename = undefined
__dirname = undefined
/* eslint-enable n/no-exports-assign, no-global-assign */

return

// eslint-disable-next-line no-unreachable
module.exports.unreachable = true
