// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { addHook, enabled } from '../index.mjs'
import { foo as fooMjs } from './fixtures/something.mjs'
import { foo as fooJs } from './fixtures/something.js'
import { strictEqual, fail, ok} from 'assert'

ok(!enabled())

addHook(() => {
  fail('should not have been called at all')
})

strictEqual(fooMjs, 42)
strictEqual(fooJs, 42)
