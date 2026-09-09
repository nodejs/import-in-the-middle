import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const benchmarkRoot = fileURLToPath(new URL('.', import.meta.url))
const fixtureRoot = resolve(benchmarkRoot, 'fixture')
const app = resolve(fixtureRoot, 'app.mjs')
const activeHook = resolve(fixtureRoot, 'active-hook.cjs')

const options = parseOptions(process.argv.slice(2))
const packageRoot = resolve(options.packageDirectory)
const results = runBenchmarks(packageRoot, options.runs)
const report = {
  formatVersion: 1,
  nodeVersion: process.version,
  benchmarks: results
}

if (options.output === undefined) {
  process.stdout.write(`${JSON.stringify(report, undefined, 2)}\n`)
} else {
  writeFileSync(options.output, `${JSON.stringify(report, undefined, 2)}\n`)
}

/**
 * @param {string[]} argumentsList Command-line arguments.
 * @returns {{ output: string | undefined, packageDirectory: string, runs: number }}
 */
function parseOptions (argumentsList) {
  let output
  let packageDirectory = process.cwd()
  let runs = 15

  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    const value = argumentsList[index + 1]

    if (argument === '--output' && value !== undefined) {
      output = resolve(value)
      index++
    } else if (argument === '--package-directory' && value !== undefined) {
      packageDirectory = value
      index++
    } else if (argument === '--runs' && value !== undefined) {
      runs = Number(value)
      index++
    } else {
      throw new Error(`Unknown or incomplete option: ${argument}`)
    }
  }

  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error('--runs must be a positive integer')
  }

  return { output, packageDirectory, runs }
}

/**
 * @param {string} packageDirectory Directory that contains import-in-the-middle.
 * @param {number} runs Number of process starts measured for each scenario.
 * @returns {{ name: string, medianMs: number }[]}
 */
function runBenchmarks (packageDirectory, runs) {
  const loader = resolve(packageDirectory, 'hook.mjs')
  const scenarios = [
    { name: 'No loader', argumentsList: [app] },
    { name: 'Inactive loader', argumentsList: ['--loader', loader, app] },
    {
      name: 'Active hook',
      argumentsList: ['--require', activeHook, '--loader', loader, app],
      environment: { IITM_BENCHMARK_ACTIVE: '1' }
    }
  ]

  return scenarios.map((scenario) => ({
    name: scenario.name,
    medianMs: measureScenario(packageDirectory, scenario, runs)
  }))
}

/**
 * @param {string} packageDirectory Directory that contains import-in-the-middle.
 * @param {{ argumentsList: string[], environment?: Record<string, string> }} scenario Benchmark invocation.
 * @param {number} runs Number of process starts measured for the scenario.
 * @returns {number}
 */
function measureScenario (packageDirectory, scenario, runs) {
  const samples = []

  for (let index = 0; index < runs; index++) {
    const startedAt = process.hrtime.bigint()
    const result = spawnSync(process.execPath, scenario.argumentsList, {
      cwd: benchmarkRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        IITM_BENCHMARK_PACKAGE_ROOT: packageDirectory,
        IITM_BENCHMARK_FIXTURE_ROOT: fixtureRoot,
        ...scenario.environment,
        NODE_NO_WARNINGS: '1'
      }
    })
    const duration = Number(process.hrtime.bigint() - startedAt) / 1e6

    if (result.status !== 0) {
      throw new Error(`Benchmark process failed: ${result.stderr || result.stdout}`)
    }

    samples.push(duration)
  }

  samples.sort(compareNumbers)
  return samples[Math.floor(samples.length / 2)]
}

/**
 * @param {number} first First number.
 * @param {number} second Second number.
 * @returns {number}
 */
function compareNumbers (first, second) {
  return first - second
}
