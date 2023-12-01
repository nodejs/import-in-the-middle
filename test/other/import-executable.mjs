// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { rejects } from 'assert'
(async () => {
  const [processMajor, processMinor] = process.versions.node.split('.').map(Number)
  const extensionlessSupported = processMajor >= 21 ||
    (processMajor === 20 && processMinor >= 10) ||
    (processMajor === 18 && processMinor >= 19)
  if (extensionlessSupported) {
    // Files without extension are supported in Node.js ^21, ^20.10.0, and ^18.19.0
    return
  }
  await rejects(() => import('./executable'), {
    name: 'TypeError',
    code: 'ERR_UNKNOWN_FILE_EXTENSION'
  })
})()
