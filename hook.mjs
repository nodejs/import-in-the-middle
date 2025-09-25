// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import * as module from 'node:module'

// Using 'module.createRequire' is key for this to be resolved by @vercel/nft:
// https://github.com/vercel/nft/pull/459/files#diff-f9de9e832021754e4f7e493614502e6a12c6adf1d75f666ffdf9c2b8de8d33bcR1090
const require = module.createRequire(import.meta.url)
const { createHook } = require('./hook.js')

const { initialize, load, resolve, getFormat, getSource } = createHook(import.meta)

export { initialize, load, resolve, getFormat, getSource }
