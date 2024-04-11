// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2024 Datadog, Inc.

import * as tsLoader from './typescript/iitm-ts-node-loader.mjs'
import * as regularLoader from '../hook.mjs'
import path from 'path'

const filename = process.env.IITM_TEST_FILE
const filteredModuleTest = path.join(import.meta.url, '../hook/filtered-export.mjs').slice(5)

if (filename === filteredModuleTest) {
  process.env.MODULES_TO_PATCH = path.join(import.meta.url, '../fixtures/export-types/default-expression-array.mjs').replace(':/', ':///')
}

export const { load, resolve, getFormat, getSource } =
  filename.includes('disabled')
    ? {}
    : (path.extname(filename).slice(-2) === 'ts' ? tsLoader : regularLoader)
