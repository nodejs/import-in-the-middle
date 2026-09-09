'use strict'

const path = require('node:path')
const { fileURLToPath } = require('node:url')

/**
 * @typedef {object} Package
 * @property {string} name
 * @property {string} packageJsonUrl
 * @property {string} packageUrl
 * @property {string} [type]
 * @property {string} [version]
 */

/**
 * @typedef {Package & { path: string }} PackageDetails
 */

/**
 * @param {typeof import('node:fs').readFileSync} readFileSync
 * @returns {(url: string) => PackageDetails|undefined}
 */
module.exports = function createGetPackageDetails (readFileSync) {
  /**
   * @param {string} url
   * @returns {PackageDetails|undefined}
   */
  return function getPackageDetails (url) {
    if (!url.startsWith('file:')) return

    const moduleUrl = new URL(url)
    moduleUrl.hash = ''
    moduleUrl.search = ''
    let directory = new URL('.', moduleUrl)

    while (true) {
      const packageJsonUrl = new URL('package.json', directory)
      let packageJson
      try {
        packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8'))
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }

      if (typeof packageJson?.name === 'string' && packageJson.name !== '') {
        const packageData = Object.freeze({
          name: packageJson.name,
          packageJsonUrl: packageJsonUrl.href,
          packageUrl: directory.href,
          type: typeof packageJson.type === 'string' ? packageJson.type : undefined,
          version: typeof packageJson.version === 'string' ? packageJson.version : undefined
        })
        return createPackageDetails(moduleUrl, packageData)
      }

      const parent = new URL('../', directory)
      if (parent.href === directory.href) return
      directory = parent
    }
  }
}

/**
 * @param {URL} moduleUrl
 * @param {Package} packageData
 * @returns {PackageDetails}
 */
function createPackageDetails (moduleUrl, packageData) {
  const modulePath = path.relative(fileURLToPath(packageData.packageUrl), fileURLToPath(moduleUrl))
  return {
    ...packageData,
    path: modulePath.replaceAll(path.sep, '/')
  }
}
