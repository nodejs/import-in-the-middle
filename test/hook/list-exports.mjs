// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import Hook from '../../index.js'
import n, {
  name1 as n1,
  name2 as n2, 
  name3 as n3, 
  name4 as n4, 
  name5 as n5, 
  "name" as n6,
  } from '../fixtures/export-types/list.mjs'
import { strictEqual } from 'assert'

Hook((exports, name) => {
  if (name.match(/list\.m?js/)) {
    exports.name1 += 1
    exports.name2 += 1
    exports.name3 += 1
    exports.name4 += 1
    exports.name5 += 1
    exports.name += 1
    exports.default += 1
  }
})

strictEqual(n1, 2)
strictEqual(n2, 2)
strictEqual(n3, 2)
strictEqual(n4, 2)
strictEqual(n5, 2)
strictEqual(n6, 2)
strictEqual(n, 2)
