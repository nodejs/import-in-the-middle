import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const options = parseOptions(process.argv.slice(2))
const base = parseBenchmark(readFileSync(options.base, 'utf8'))
const head = parseBenchmark(readFileSync(options.head, 'utf8'))
const baseByName = new Map(base.benchmarks.map((benchmark) => [benchmark.name, benchmark.medianMs]))
const results = []

for (const benchmark of head.benchmarks) {
  const baseMs = baseByName.get(benchmark.name)

  if (baseMs === undefined) {
    throw new Error(`Base benchmark is missing ${benchmark.name}`)
  }

  results.push({
    name: benchmark.name,
    baseMs,
    headMs: benchmark.medianMs,
    changePercent: ((benchmark.medianMs - baseMs) / baseMs) * 100
  })
}

const report = {
  formatVersion: 1,
  prNumber: readPositiveInteger('PR_NUMBER'),
  baseSha: readSha('BASE_SHA'),
  headSha: readSha('HEAD_SHA'),
  nodeVersion: head.nodeVersion,
  results
}

writeFileSync(options.output, `${JSON.stringify(report, undefined, 2)}\n`)

/**
 * @param {string[]} argumentsList Command-line arguments.
 * @returns {{ base: string, head: string, output: string }}
 */
function parseOptions (argumentsList) {
  const values = new Map()

  for (let index = 0; index < argumentsList.length; index += 2) {
    values.set(argumentsList[index], argumentsList[index + 1])
  }

  const base = values.get('--base')
  const head = values.get('--head')
  const output = values.get('--output')

  if (base === undefined || head === undefined || output === undefined || values.size !== 3) {
    throw new Error('Expected --base, --head, and --output')
  }

  return { base: resolve(base), head: resolve(head), output: resolve(output) }
}

/**
 * @param {string} source JSON benchmark report.
 * @returns {{ nodeVersion: string, benchmarks: { name: string, medianMs: number }[] }}
 */
function parseBenchmark (source) {
  const report = JSON.parse(source)

  if (report.formatVersion !== 1 || typeof report.nodeVersion !== 'string' || !Array.isArray(report.benchmarks)) {
    throw new Error('Invalid benchmark report')
  }

  return report
}

/**
 * @param {string} name Environment variable name.
 * @returns {number}
 */
function readPositiveInteger (name) {
  const value = Number(process.env[name])

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}

/**
 * @param {string} name Environment variable name.
 * @returns {string}
 */
function readSha (name) {
  const value = process.env[name]

  if (value === undefined || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a full commit SHA`)
  }

  return value
}
