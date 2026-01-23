// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { execSync } from 'child_process'
import { doesNotThrow } from 'assert'

const env = {
  ...process.env,
  // Use the test harness loader so IITM doesn't wrap its own implementation
  // files (keeps c8 coverage attribution sane).
  NODE_OPTIONS: '--no-warnings --experimental-loader ./test/fixtures/double-loader.mjs --experimental-loader ./test/generic-loader.mjs'
}

doesNotThrow(() => {
  execSync('node -p 0', { env })
})
