// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const { randomBytes } = require('crypto')
const specifiers = new Map()
const isWin = process.platform === "win32"

// FIXME: Typescript extensions are added temporarily until we find a better
// way of supporting arbitrary extensions
const EXTENSION_RE = /\.(js|mjs|cjs|ts|mts|cts)$/
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

/**
 * Determines if a specifier represents an export all ESM line.
 * Note that the expected `line` isn't 100% valid ESM. It is derived
 * from the `getExports` function wherein we have recognized the true
 * line and re-mapped it to one we expect.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isStarExportLine(line) {
  return /^\* from /.test(line)
}

/**
 * @typedef {object} ProcessedModule
 * @property {string[]} imports A set of ESM import lines to be added to the
 * shimmed module source.
 * @property {string[]} namespaces A set of identifiers representing the
 * modules in `imports`, e.g. for `import * as foo from 'bar'`, "foo" will be
 * present in this array.
 * @property {string[]} setters The shimmed setters for all the exports
 * from the module and any transitive export all modules.
 */

/**
 * Processes a module's exports and builds a set of new import statements,
 * namespace names, and setter blocks. If an export all export if encountered,
 * the target exports will be hoisted to the current module via a generated
 * namespace.
 *
 * @param {object} params
 * @param {string} params.srcUrl The full URL to the module to process.
 * @param {object} params.context Provided by the loaders API.
 * @param {function} parentGetSource Provides the source code for the parent
 * module.
 * @returns {Promise<ProcessedModule>}
 */
async function processModule({ srcUrl, context, parentGetSource }) {
  const exportNames = await getExports(srcUrl, context, parentGetSource)
  const imports = [`import * as namespace from ${JSON.stringify(srcUrl)}`]
  const namespaces = ['namespace']
  const setters = []

  for (const n of exportNames) {
    if (isStarExportLine(n) === true) {
      const [_, modFile] = n.split('* from ')
      const modUrl = new URL(modFile, srcUrl).toString()
      const modName = Buffer.from(modFile, 'hex') + Date.now() + randomBytes(4).toString('hex')

      imports.push(`import * as $${modName} from ${JSON.stringify(modUrl)}`)
      namespaces.push(`$${modName}`)

      const data = await processModule({ srcUrl: modUrl, context, parentGetSource })
      Array.prototype.push.apply(setters, data.setters)

      continue
    }

    setters.push(`
    let $${n} = _.${n}
    export { $${n} as ${n} }
    set.${n} = (v) => {
      $${n} = v
      return true
    }
    `)
  }

  return { imports, namespaces, setters }
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


    specifiers.set(url.url, specifier)

    return {
      url: addIitm(url.url),
      shortCircuit: true,
      format: url.format
    }
  }

  const iitmURL = new URL('lib/register.js', meta.url).toString()
  async function getSource (url, context, parentGetSource) {
    if (hasIitm(url)) {
      const realUrl = deleteIitm(url)
      const { imports, namespaces, setters } = await processModule({
          srcUrl: realUrl,
          context,
          parentGetSource
      })

      return {
        source: `
import { register } from '${iitmURL}'
${imports.join('\n')}

const _ = Object.assign({}, ...[${namespaces.join(', ')}])
const set = {}

${setters.join('\n')}
register(${JSON.stringify(realUrl)}, _, set, ${JSON.stringify(specifiers.get(realUrl))})
`
      }
    }

    return parentGetSource(url, context, parentGetSource)
  }

  // For Node.js 16.12.0 and higher.
  async function load (url, context, parentLoad) {
    if (hasIitm(url)) {
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
    }
  }
}

module.exports = { createHook }
