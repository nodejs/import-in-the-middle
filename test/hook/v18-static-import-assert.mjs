// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import Hook from '../../index.js'
import jsonMjs from '../fixtures/json.mjs'
import { strictEqual } from 'assert'

// TODO: remove this test case when v18/v20 is EOL
// This test fails on v22 >=
if (process.version.startsWith('v22')) {
  console.log('skipping v18-static-import-assert.mjs as this is Node.js v22 and test wants <= v21.x')
  process.exit(0)
}

Hook((exports, name) => {
  if (name.match(/json\.mjs/)) {
    exports.default.data += '-dawg'
  }
})

strictEqual(jsonMjs.data, 'dog-dawg')
