import { readFileSync, statSync } from 'node:fs'

import { getScenarios } from './scenarios.mjs'
import { compare, sampling } from './statistics.mjs'

const platforms = new Set(['linux', 'darwin', 'win32'])
const architectures = new Set()
architectures.add('x64')
architectures.add('arm64')

/** @typedef {ReturnType<typeof getScenarios>[number] & { trials: import('./statistics.mjs').Pair[][] }} Benchmark */
/**
 * @typedef {{ formatVersion: 2, workloadVersion: 1, prNumber: number, baseSha: string, headSha: string, mergeSha: string,
 * nodeVersion: string, platform: string, arch: string, selective: boolean, synchronous: boolean,
 * benchmarks: Benchmark[] }} Report
 */

/** @param {string} filename Untrusted benchmark artifact. */
export function readReport (filename) {
  if (statSync(filename).size > 8 * 1024 * 1024) throw new Error('Benchmark artifact is too large')
  const report = /** @type {Report} */ (JSON.parse(readFileSync(filename, 'utf8')))
  if (report?.formatVersion !== 2 || report.workloadVersion !== 1 ||
    !Number.isInteger(report.prNumber) || report.prNumber < 1 ||
    typeof report.baseSha !== 'string' || !/^[a-f0-9]{40}$/.test(report.baseSha) ||
    typeof report.headSha !== 'string' || !/^[a-f0-9]{40}$/.test(report.headSha) ||
    typeof report.mergeSha !== 'string' || !/^[a-f0-9]{40}$/.test(report.mergeSha) ||
    typeof report.nodeVersion !== 'string' || !/^v\d+\.\d+\.\d+$/.test(report.nodeVersion) ||
    !platforms.has(report.platform) || !architectures.has(report.arch) ||
    typeof report.selective !== 'boolean' || typeof report.synchronous !== 'boolean') {
    throw new Error('Invalid benchmark metadata')
  }
  const scenarios = getScenarios(report.selective, report.synchronous)
  if (!Array.isArray(report.benchmarks) || report.benchmarks.length !== scenarios.length) {
    throw new Error('Invalid benchmark scenarios')
  }
  for (let index = 0; index < scenarios.length; index++) {
    const benchmark = report.benchmarks[index]
    if (benchmark?.name !== scenarios[index].name || !Array.isArray(benchmark.trials) ||
      benchmark.trials.length < sampling.minTrials || benchmark.trials.length > sampling.maxTrials) {
      throw new Error('Invalid benchmark trials')
    }
    const runs = benchmark.trials[0]?.length
    if (!Number.isInteger(runs) || runs < sampling.minRuns || runs > sampling.maxRuns) {
      throw new Error('Invalid benchmark runs')
    }
    for (const trial of benchmark.trials) {
      if (!Array.isArray(trial) || trial.length !== runs) throw new Error('Inconsistent benchmark runs')
      for (const pair of trial) {
        for (const sample of [pair?.base, pair?.head]) {
          if (!Number.isFinite(sample?.wallMs) || sample.wallMs <= 0 || sample.wallMs > 30000 ||
            !Number.isFinite(sample?.cpuMs) || sample.cpuMs <= 0 || sample.cpuMs > 1000000) {
            throw new Error('Invalid benchmark sample')
          }
        }
      }
    }
  }
  return report
}

/** @param {ReturnType<typeof readReport>[]} reports Validated reports from the same workflow run. */
export function formatReports (reports) {
  const lines = [
    '<!-- import-in-the-middle-benchmark -->', '## Benchmark report', '',
    'Fresh-process time to fixture readiness; warm filesystem cache, compilation cache disabled.',
    'Changes compare typical startup: the mean of trial median paired head/base ratios.',
    'CV is the relative standard deviation of trial ratios. Raw means, SD, and p95 expose slow starts.',
    'Raw samples remain in the workflow artifacts. Unstable rows do not support a performance conclusion.'
  ]
  for (const report of reports) {
    lines.push('', `### Node ${report.nodeVersion} (${report.platform}/${report.arch})`, '',
      '| Scenario | Base median / p95 | PR median / p95 | Paired change | Trial CV | Raw mean ± SD (base; PR) |',
      '| --- | ---: | ---: | ---: | ---: | ---: |')
    for (const benchmark of report.benchmarks) {
      const result = compare(benchmark.trials)
      const change = result.stable
        ? `${result.changePercent >= 0 ? '+' : ''}${result.changePercent.toFixed(2)}%`
        : 'Unstable'
      lines.push(`| ${benchmark.name} | ${result.base.median.toFixed(2)} / ${result.base.p95.toFixed(2)} ms | ` +
        `${result.head.median.toFixed(2)} / ${result.head.p95.toFixed(2)} ms | ${change} | ` +
        `${result.ratioCvPercent.toFixed(2)}% | ` +
        `${result.base.mean.toFixed(2)} ± ${result.base.stddev.toFixed(2)}; ` +
        `${result.head.mean.toFixed(2)} ± ${result.head.stddev.toFixed(2)} ms |`)
    }
  }
  lines.push('', `Base: \`${reports[0].baseSha.slice(0, 7)}\` · PR head: \`${reports[0].headSha.slice(0, 7)}\` · ` +
    `Measured merge: \`${reports[0].mergeSha.slice(0, 7)}\``)
  return lines.join('\n')
}
