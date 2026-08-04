'use strict'

const { readFileSync } = process.getBuiltinModule?.('fs') ?? require('node:fs')

let packageTypes

/** @typedef {'builtin'|'module'|'module-typescript'|'commonjs'|'commonjs-typescript'} NodeModuleFormat */

/**
 * @param {'.js'|'.ts'} extension
 * @param {string|undefined} type
 * @returns {NodeModuleFormat}
 */
function getPackageFormat (extension, type) {
  if (type === 'module') return extension === '.ts' ? 'module-typescript' : 'module'
  return extension === '.ts' ? 'commonjs-typescript' : 'commonjs'
}

/**
 * @param {string} url
 * @param {string} [packageJsonUrl]
 * @param {string} [packageType]
 * @returns {NodeModuleFormat|undefined}
 */
module.exports = function getNodeModuleFormat (url, packageJsonUrl, packageType) {
  if (url.startsWith('node:')) return 'builtin'
  if (!url.startsWith('file:')) return undefined
  const pathname = new URL(url).pathname
  let extension
  if (pathname.endsWith('.mjs')) extension = '.mjs'
  else if (pathname.endsWith('.cjs')) extension = '.cjs'
  else if (pathname.endsWith('.mts')) extension = '.mts'
  else if (pathname.endsWith('.cts')) extension = '.cts'
  else if (pathname.endsWith('.js')) extension = '.js'
  else if (pathname.endsWith('.ts')) extension = '.ts'
  else return undefined

  if (extension === '.mjs') return 'module'
  if (extension === '.cjs') return 'commonjs'
  if (extension === '.mts') return 'module-typescript'
  if (extension === '.cts') return 'commonjs-typescript'

  packageTypes ??= new Map()
  const packageDirectory = packageJsonUrl === undefined ? undefined : new URL('.', packageJsonUrl).href
  const visited = []
  let directory = new URL('.', url)
  while (true) {
    if (directory.href === packageDirectory) {
      return getPackageFormat(extension, packageType)
    }

    if (packageDirectory === undefined && packageTypes.has(directory.href)) {
      const type = packageTypes.get(directory.href)
      for (const href of visited) packageTypes.set(href, type)
      return getPackageFormat(extension, type)
    }

    visited.push(directory.href)
    try {
      const source = readFileSync(new URL('package.json', directory), 'utf8')
      const type = JSON.parse(source).type
      packageTypes.set(directory.href, type)
      if (packageDirectory !== undefined) return getPackageFormat(extension, type)
      continue
    } catch (error) {
      if (error.code !== 'ENOENT') return undefined
    }

    const parent = new URL('../', directory)
    if (parent.href === directory.href) {
      for (const href of visited) packageTypes.set(href, undefined)
      return getPackageFormat(extension, undefined)
    }
    directory = parent
  }
}
