// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2024 Datadog, Inc.

import * as tsLoader from './typescript/iitm-ts-node-loader.mjs'
import * as regularLoader from '../hook.mjs'
import path from 'path'

const filename = process.env.IITM_TEST_FILE || ''

const selected =
  filename.includes('disabled') || filename.includes('register')
    ? {}
    : (path.extname(filename).slice(-2) === 'ts' ? tsLoader : regularLoader)

// During tests we don't want IITM to wrap its own implementation files, because
// that makes c8 attribute coverage to the generated wrapper source instead of
// the real module source.
const selfExclude = /\/import-in-the-middle\/(create-hook\.mjs|hook\.mjs|index\.js|lib\/)/

export async function initialize (data) {
  if (typeof selected.initialize !== 'function') return

  let exclude = []

  if (data && data.exclude) {
    exclude = Array.isArray(data.exclude) ? data.exclude.slice() : [data.exclude]
  }

  exclude.push(selfExclude)

  return selected.initialize({ ...data, exclude })
}

export const load = selected.load
export const resolve = selected.resolve
export const getFormat = selected.getFormat
export const getSource = selected.getSource
