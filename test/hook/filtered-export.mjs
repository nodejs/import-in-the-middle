// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import Hook from '../../index.js'
import a from '../fixtures/export-types/default-expression-array.mjs'
import n from '../fixtures/export-types/default-expression-num.mjs'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.match(/default-expression-array\.m?js/)) {
    exports.default[0] += 1
  } else if (name.match(/default-expression-num\.m?js/)) {
    exports.default += 1
  }
})

strictEqual(a[0], 2)
strictEqual(n, 1)
