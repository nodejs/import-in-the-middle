import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import * as module from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { supportsSyncHooks } from '../supports-sync-hooks.mjs'
import { getScenarios } from './scenarios.mjs'
import { compare, sampling } from './statistics.mjs'

/** @typedef {import('./statistics.mjs').Sample} Sample */
/** @typedef {import('./statistics.mjs').Pair} Pair */
/** @typedef {ReturnType<typeof getScenarios>[number]} Scenario */

if (process.argv[2] === '--help' && process.argv.length === 3) {
  process.stdout.write('Usage: npm run benchmark -- [--package-directory DIR] [--base-directory DIR] ' +
    '[--output FILE] [--runs PAIRS_PER_TRIAL] [--trials COUNT] [--scenario NAME]\n' +
    `Default: self-comparison, ${sampling.trials} trials of ${sampling.runs} pairs; ` +
    `noisy scenarios expand to ${sampling.maxRuns} pairs per trial.\n` +
    'Explicit --runs fixes the sample count. See benchmark/README.md.\n')
  process.exit(0)
}
const fixture = fileURLToPath(new URL('fixture/app.mjs', import.meta.url))
const legacyWarning = new RegExp('^\\(node:\\d+\\) ExperimentalWarning: Custom ESM Loaders ' +
  'is an experimental feature and might change at any time\\n\\(Use `[^\\n]+ --trace-warnings \\.\\.\\.` ' +
  'to show where the warning was created\\)\\n', 'gm')
const options = parseOptions(process.argv.slice(2))
const roots = [options.baseDirectory ?? options.packageDirectory, options.packageDirectory]
const selective = typeof module.register === 'function'
const synchronous = supportsSyncHooks()
const benchmarks = []

const scenarios = getScenarios(selective, synchronous)
if (options.scenario !== undefined && !scenarios.some(
  /** @param {Scenario} scenario */
  scenario => scenario.name === options.scenario)) {
  throw new Error('Unknown or unsupported benchmark scenario')
}
for (const scenario of scenarios) {
  if (options.scenario !== undefined && scenario.name !== options.scenario) continue
  for (let warmup = 0; warmup < 5; warmup++) {
    measure(roots[0], scenario)
    measure(roots[1], scenario)
  }
  const trials = Array.from({ length: options.trials }, () => [])
  collect(trials, scenario, options.runs ?? sampling.runs)
  if (options.runs === undefined && options.trials >= sampling.trials && !compare(trials).stable) {
    process.stderr.write(`${scenario.name}: increasing samples for noisy measurements\n`)
    collect(trials, scenario, sampling.maxRuns - sampling.runs)
  }
  const summary = compare(trials)
  benchmarks.push({ ...scenario, trials, summary })
  process.stderr.write(`${scenario.name}: ${summary.changePercent.toFixed(2)}%; ` +
    `paired trial CV ${summary.ratioCvPercent.toFixed(2)}%${summary.stable ? '' : ' (unstable)'}\n`)
}

const report = {
  formatVersion: 2,
  workloadVersion: 1,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  selective,
  synchronous,
  prNumber: process.env.PR_NUMBER === undefined ? 0 : Number(process.env.PR_NUMBER),
  baseSha: process.env.BASE_SHA,
  headSha: process.env.HEAD_SHA,
  mergeSha: process.env.MERGE_SHA,
  benchmarks
}
const output = `${JSON.stringify(report)}\n`
if (options.output === undefined) process.stdout.write(output)
else writeFileSync(options.output, output)

/** @param {string[]} argumentsList Command-line options. */
function parseOptions (argumentsList) {
  const options = {
    packageDirectory: process.cwd(),
    baseDirectory: undefined,
    output: undefined,
    scenario: undefined,
    runs: undefined,
    trials: sampling.trials
  }
  const names = new Map([
    ['--package-directory', 'packageDirectory'], ['--base-directory', 'baseDirectory'], ['--output', 'output'],
    ['--runs', 'runs'], ['--trials', 'trials'], ['--scenario', 'scenario']
  ])
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = names.get(argumentsList[index])
    const value = argumentsList[index + 1]
    if (name === undefined || value === undefined) throw new Error('Unknown or incomplete benchmark option')
    options[name] = name === 'runs' || name === 'trials' ? Number(value) : name === 'scenario' ? value : resolve(value)
  }
  if ((options.runs !== undefined && (!Number.isInteger(options.runs) ||
    options.runs < sampling.minRuns || options.runs > sampling.maxRuns)) ||
    !Number.isInteger(options.trials) || options.trials < sampling.minTrials || options.trials > sampling.maxTrials) {
    throw new Error(`Expected ${sampling.minRuns}–${sampling.maxRuns} --runs and ` +
      `${sampling.minTrials}–${sampling.maxTrials} --trials`)
  }
  return options
}

/**
 * @param {Pair[][]} trials Existing trials to extend without discarding observations.
 * @param {{ mode: string, workload: string }} scenario Public loader invocation.
 * @param {number} runs Additional pairs per trial.
 */
function collect (trials, scenario, runs) {
  for (let trial = 0; trial < trials.length; trial++) {
    const pairs = trials[trial]
    const first = pairs.length
    for (let pair = first; pair < first + runs; pair++) {
      const samples = []
      for (let offset = 0; offset < 2; offset++) {
        const index = (trial + pair + offset) % 2
        samples[index] = measure(roots[index], scenario)
      }
      pairs.push({ base: samples[0], head: samples[1] })
    }
  }
}

/**
 * @param {string} packageDirectory Revision to measure.
 * @param {{ mode: string, workload: string }} scenario Public loader invocation.
 * @returns {Sample}
 */
function measure (packageDirectory, scenario) {
  const argumentsList = !selective && scenario.mode.startsWith('async-')
    ? ['--loader', resolve(packageDirectory, 'hook.mjs'), fixture]
    : [fixture]
  if (process.allowedNodeEnvironmentFlags.has('--disable-warning')) {
    argumentsList.unshift('--disable-warning=ExperimentalWarning')
  }
  const environment = {
    ...process.env,
    NODE_OPTIONS: '',
    NODE_COMPILE_CACHE: '',
    NODE_DISABLE_COMPILE_CACHE: '1',
    NODE_DEBUG: '',
    NODE_DEBUG_NATIVE: '',
    TZ: 'UTC',
    IITM_BENCHMARK_PACKAGE_ROOT: packageDirectory,
    IITM_BENCHMARK_MODE: scenario.mode,
    IITM_BENCHMARK_WORKLOAD: scenario.workload
  }
  delete environment.NODE_NO_WARNINGS
  delete environment.NODE_REDIRECT_WARNINGS
  const result = spawnSync(process.execPath, argumentsList, {
    encoding: 'utf8',
    timeout: 30000,
    env: environment
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Benchmark process failed: ${result.error?.message ?? result.stderr ?? result.stdout}`)
  }
  const warnings = result.stderr.replace(legacyWarning, '')
  if (warnings) throw new Error(`Benchmark emitted warnings: ${warnings}`)
  return JSON.parse(result.stdout)
}
