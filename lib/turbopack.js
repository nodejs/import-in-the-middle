// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const NODE_MODULES_PATH = '/node_modules/'

/**
 * @param {string} specifier
 * @param {string} [url]
 * @returns {string | undefined}
 */
function getTurbopackSpecifier (specifier, url) {
  const usingTurbopack = process.env.TURBOPACK ?? process.argv.includes('--turbo')
  if (!usingTurbopack) return

  const hashSeparator = specifier.lastIndexOf('-')
  if (hashSeparator === -1) return
  const result = specifier.slice(0, hashSeparator)
  if (url === undefined || url === `node:${result}`) return result

  const nodeModulesIndex = url.lastIndexOf(NODE_MODULES_PATH)
  if (nodeModulesIndex === -1) return
  const packageStart = nodeModulesIndex + NODE_MODULES_PATH.length
  let packageEnd = url.indexOf('/', packageStart)
  if (url[packageStart] === '@') packageEnd = url.indexOf('/', packageEnd + 1)
  if (packageEnd === -1) packageEnd = url.length
  if (url.slice(packageStart, packageEnd) === result) return result
}

module.exports = getTurbopackSpecifier
