const { resolve } = require('node:path')

const packageRoot = process.env.IITM_BENCHMARK_PACKAGE_ROOT
const fixtureRoot = process.env.IITM_BENCHMARK_FIXTURE_ROOT

if (packageRoot === undefined || fixtureRoot === undefined) {
  throw new Error('IITM_BENCHMARK_PACKAGE_ROOT and IITM_BENCHMARK_FIXTURE_ROOT are required')
}

const Hook = require(resolve(packageRoot, 'index.js'))

Hook([resolve(fixtureRoot, 'a.mjs')], (exports) => {
  exports.value += 1
})
