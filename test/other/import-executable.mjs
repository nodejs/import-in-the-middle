// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { rejects } from 'assert'
(async () => {
  const [processMajor] = process.versions.node.split('.').map(Number)
  if (processMajor >= 21) {
    // Files without extension are supported in Node.js 21+
    return
  }
  await rejects(() => import('./executable'), {
    name: 'TypeError',
    code: 'ERR_UNKNOWN_FILE_EXTENSION'
  })
})()
