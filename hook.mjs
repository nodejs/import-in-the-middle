// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const specifiers = new Map()
const isWin = process.platform === "win32"


// FIXME: Typescript extensions are added temporarily until we find a better
// way of supporting arbitrary extensions
const EXTENSION_RE = /\.(js|mjs|cjs|ts|mts|cts)$/
const NODE_VERSION = process.versions.node.split('.')
const NODE_MAJOR = Number(NODE_VERSION[0])
const NODE_MINOR = Number(NODE_VERSION[1])

let entrypoint

function hasIitm (url) {
  try {
    return new URL(url).searchParams.has('iitm')
  } catch {
    return false
  }
}

function deleteIitm (url) {
  let resultUrl
  try {
    const urlObj = new URL(url)
    if (urlObj.searchParams.has('iitm')) {
      urlObj.searchParams.delete('iitm')
      resultUrl = urlObj.href
      if (resultUrl.startsWith('file:node:')) {
        resultUrl = resultUrl.replace('file:', '')
      }
      if (resultUrl.startsWith('file:///node:')) {
        resultUrl = resultUrl.replace('file:///', '')
      }
    } else {
      resultUrl = urlObj.href
    }
  } catch {
    resultUrl = url
  }
  return resultUrl
}

function isNode16AndBiggerOrEqualsThan16_17_0() {
  return NODE_MAJOR === 16 && NODE_MINOR >= 17
}

function isFileProtocol (urlObj) {
  return urlObj.protocol === 'file:'
}

function isNodeProtocol (urlObj) {
  return urlObj.protocol === 'node:'
}

function needsToAddFileProtocol(urlObj) {
  if (NODE_MAJOR === 17) {
    return !isFileProtocol(urlObj)
  }
  if (isNode16AndBiggerOrEqualsThan16_17_0()) {
    return !isFileProtocol(urlObj) && !isNodeProtocol(urlObj)
  }
  return !isFileProtocol(urlObj) && NODE_MAJOR < 18
}


function addIitm (url) {
  const urlObj = new URL(url)
  urlObj.searchParams.set('iitm', 'true')
  return needsToAddFileProtocol(urlObj) ? 'file:' + urlObj.href : urlObj.href
}

export async function resolve (specifier, context, parentResolve) {
  const { parentURL = '' } = context
  const newSpecifier = deleteIitm(specifier)
  if (isWin && parentURL.indexOf('file:node') === 0) {
    context.parentURL = ''
  }
  const url = await parentResolve(newSpecifier, context, parentResolve)
  if (parentURL === '' && !EXTENSION_RE.test(url.url)) {
    entrypoint = url.url
    return { url: url.url, format: 'commonjs' }
  }

  if (parentURL === import.meta.url || hasIitm(parentURL)) {
    return url
  }

  if (context.importAssertions && context.importAssertions.type === 'json') {
    return url
  }


  specifiers.set(url.url, specifier)

  return {
    url: addIitm(url.url),
    shortCircuit: true
  }
}

export function getFormat (url, context, parentGetFormat) {
  if (hasIitm(url)) {
    return {
      format: 'module'
    }
  }
  if (url === entrypoint) {
    return {
      format: 'commonjs'
    }
  }

  return parentGetFormat(url, context, parentGetFormat)
}

const iitmURL = new URL('lib/register.js', import.meta.url).toString()
export async function getSource (url, context, parentGetSource) {
  if (hasIitm(url)) {
    const realUrl = deleteIitm(url)
    const realModule = await import(realUrl)
    const exportNames = Object.keys(realModule)
    return {
      source: `
import { register } from '${iitmURL}'
import * as namespace from '${url}'
const set = {}
${exportNames.map((n) => `
let $${n} = namespace.${n}
export { $${n} as ${n} }
set.${n} = (v) => {
  $${n} = v
  return true
}
`).join('\n')}
register('${realUrl}', namespace, set, '${specifiers.get(realUrl)}')
`
    }
  }

  return parentGetSource(url, context, parentGetSource)
}

// For Node.js 16.12.0 and higher.
export async function load (url, context, parentLoad) {
  if (hasIitm(url)) {
    const { source } = await getSource(url, context)
    return {
      source,
      shortCircuit: true,
      format: 'module'
    }
  }

  return parentLoad(url, context, parentLoad)
}

