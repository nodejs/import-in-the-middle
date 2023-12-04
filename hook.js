// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const fs = require('fs');
const { fileURLToPath } = require('url')
const specifiers = new Map()
const isWin = process.platform === "win32"

// FIXME: Typescript extensions are added temporarily until we find a better
// way of supporting arbitrary extensions
const EXTENSION_RE = /\.(js|mjs|cjs|ts|mts|cts)$/
const EXTENSION_MJS_RE = /\.mjs$/;
const NODE_VERSION = process.versions.node.split('.')
const NODE_MAJOR = Number(NODE_VERSION[0])
const NODE_MINOR = Number(NODE_VERSION[1])

let entrypoint

let getExports
if (NODE_MAJOR >= 20 || (NODE_MAJOR == 18 && NODE_MINOR >= 19)) {
  getExports = require('./lib/get-exports.js')
} else {
  getExports = (url) => import(url).then(Object.keys)
}

if (NODE_MAJOR >= 16) {
  getEsmExports = require('./lib/get-esm-exports.js')
} else {
  getEsmExports = undefined
}

function hasIitm (url) {
  try {
    return new URL(url).searchParams.has('iitm')
  } catch {
    return false
  }
}

function isIitm (url, meta) {
  return url === meta.url || url === meta.url.replace('hook.mjs', 'hook.js')
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

function createHook (meta) {
  async function resolve (specifier, context, parentResolve) {
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

    if (isIitm(parentURL, meta) || hasIitm(parentURL)) {
      return url
    }

    // Node.js v21 renames importAssertions to importAttributes
    if (
      (context.importAssertions && context.importAssertions.type === 'json') ||
      (context.importAttributes && context.importAttributes.type === 'json')
    ) {
      return url
    }
    
    // on Node 16.12.0, url.format is undefined for .mjs files, so explicitly set it to 'module'
    if (url.format === undefined && EXTENSION_MJS_RE.test(url.url)) {
      url.format = 'module'
    }

    specifiers.set(url.url, specifier)

    return {
      url: url.format !== 'module' || NODE_MAJOR < 16 ? addIitm(url.url) : url.url,
      shortCircuit: true,
      format: url.format
    }
  }

  const iitmURL = new URL('lib/register.js', meta.url).toString()
  async function getSource (url, context, parentGetSource) {
    if (hasIitm(url)) {
      
      const realUrl = deleteIitm(url)
      
      const exportNames = await getExports(realUrl, context, parentGetSource)
      
      return { 
        source: `
import { register } from '${iitmURL}'
import * as namespace from ${JSON.stringify(url)}
const set = {}
${exportNames.map((n) => `
let $${n} = namespace.${n}
export { $${n} as ${n} }
set.${n} = (v) => {
  $${n} = v
  return true
}
`).join('\n')}
register(${JSON.stringify(realUrl)}, namespace, set, ${JSON.stringify(specifiers.get(realUrl))})
`
      } 
    }
    else if (NODE_MAJOR >= 16 && context.format === 'module') {
      let fileContents
      try {
        fileContents = fs.readFileSync(fileURLToPath(url), 'utf8')
      } catch (parseError) {
        console.error(`Had trouble reading file: ${fileContents}, got error: ${parseError}`);
        return parentGetSource(url, context, parentGetSource)
      }      
      try {
        const outPut = getEsmExports(fileContents, true, url)
        fileContents = outPut.code
        exportAlias = outPut.exportAlias
      } catch (parseError) {
        console.error(`Tried AST parsing ${realPath}, got error: ${parseError}`);
        return parentGetSource(url, context, parentGetSource)
      }
      const src = `${fileContents}
import { register as DATADOG_REGISTER_FUNC } from '${iitmURL}';
{
const set = {}
const namespace = {}
${Object.entries(exportAlias).map(([key, value]) => `
set.${key} = (v) => {
  ${value} = v;
  return true;
};
namespace.${key} = ${value}
`).join('\n')}
DATADOG_REGISTER_FUNC(${JSON.stringify(url)}, namespace, set, ${JSON.stringify(specifiers.get(url))})
}
`
      return { 
        source: src
      }
    }

    return parentGetSource(url, context, parentGetSource)
  }

  // For Node.js 16.12.0 and higher.
  async function load (url, context, parentLoad) {
    if (hasIitm(url) || context.format === 'module') {
      const { source } = await getSource(url, context, parentLoad)
      return {
        source,
        shortCircuit: true,
        format: 'module'
      }
    }

    return parentLoad(url, context, parentLoad)
  }

  if (NODE_MAJOR >= 17 || (NODE_MAJOR === 16 && NODE_MINOR >= 12)) {
    return { load, resolve }
  } else {
    return {
      load,
      resolve,
      getSource,
      getFormat (url, context, parentGetFormat) {
        if (hasIitm(url) || context.format === 'module') {
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
    }
  }
}

module.exports = { createHook }
