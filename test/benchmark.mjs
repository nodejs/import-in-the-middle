import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'

import { readReport, formatReports } from '../benchmark/report.mjs'
import { getScenarios } from '../benchmark/scenarios.mjs'
import { compare, summarize } from '../benchmark/statistics.mjs'

/** @typedef {ReturnType<typeof getScenarios>[number]} Scenario */
/** @typedef {import('../benchmark/report.mjs').Benchmark} Benchmark */
/** @typedef {import('../benchmark/statistics.mjs').Pair} Pair */
/**
 * @typedef {{ owner: string, repo: string, body: string, issue_number?: number, comment_id?: number }} CommentRequest
 */
/** @typedef {{ operation: 'create' | 'update', input: CommentRequest }} CommentCall */

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const directory = mkdtempSync(join(tmpdir(), 'iitm-benchmark-test-'))
const filename = join(directory, 'report.json')
const pair = { base: { wallMs: 100, cpuMs: 50 }, head: { wallMs: 110, cpuMs: 60 } }
const trials = Array.from({ length: 8 }, () => Array.from({ length: 20 }, () => structuredClone(pair)))
const original = {
  formatVersion: 2,
  workloadVersion: 1,
  prNumber: 293,
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  mergeSha: 'c'.repeat(40),
  nodeVersion: 'v24.20.0',
  platform: 'linux',
  arch: 'x64',
  selective: true,
  synchronous: true,
  benchmarks: getScenarios(true, true).map(
    /** @param {Scenario} scenario */
    scenario => ({ ...scenario, trials: structuredClone(trials) }))
}

/** @param {object} report Artifact to publish to the parser. */
function parse (report) {
  writeFileSync(filename, JSON.stringify(report))
  return readReport(filename)
}

/** @param {string[]} argumentsList CLI options. */
function run (argumentsList) {
  return spawnSync(process.execPath, [join(root, 'benchmark/run.mjs'), ...argumentsList], {
    cwd: root, encoding: 'utf8'
  })
}

/**
 * @param {{ head?: string, base?: string, merge?: string, state?: string, existing?: boolean,
 * payloadBase?: string, parents?: string[] }} options
 * @param {CommentCall[]} [calls]
 */
async function publish (options = {}, calls = []) {
  const workflow = readFileSync(join(root, '.github/workflows/benchmark-report.yml'), 'utf8')
  assert.match(workflow, /concurrency:\n {6}group: benchmark-report\n {6}cancel-in-progress: false/)
  assert.match(workflow, /cancel-in-progress: false\n {6}queue: max/)
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/)
  const producer = readFileSync(join(root, '.github/workflows/benchmark.yml'), 'utf8')
  assert.match(producer, /ref: \$\{\{ github.sha \}\}/)
  assert.match(producer, /MERGE_SHA: \$\{\{ github.sha \}\}/)
  assert.match(producer, /fetch-depth: 2/)
  assert.match(producer, /BASE_SHA=\$\(git rev-parse HEAD\^1\)/)
  assert.match(producer, /BASE_SHA: \$\{\{ steps.base.outputs.sha \}\}/)
  const script = workflow.split('          script: |\n')[1].replace(/^ {12}/gm, '')
  const wrapped = 'module.exports = async function (github, context, core) {\n' +
    `${script.trimEnd().replace(/^/gm, '  ')}\n}\n`
  const lint = await new ESLint().lintText(wrapped, { filePath: 'benchmark/workflow-script.cjs' })
  assert.deepEqual(lint[0].messages, [])
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const execute = new AsyncFunction('require', 'github', 'context', 'core', script)
  const github = {
    rest: {
      pulls: {
        get: async () => ({
          data: {
            state: options.state ?? 'open',
            merge_commit_sha: options.merge ?? original.mergeSha,
            head: { sha: options.head ?? original.headSha },
            base: { sha: options.payloadBase ?? original.baseSha }
          }
        })
      },
      repos: {
        getCommit: async () => ({
          data: {
            parents: (options.parents ?? [options.base ?? original.baseSha, original.headSha]).map(
              /** @param {string} sha */
              sha => ({ sha }))
          }
        })
      },
      issues: {
        listComments: async () => {},
        /** @param {CommentRequest} input */
        createComment: async input => { calls.push({ operation: 'create', input }) },
        /** @param {CommentRequest} input */
        updateComment: async input => { calls.push({ operation: 'update', input }) }
      }
    },
    paginate: async () => options.existing
      ? [{ id: 7, user: { login: 'github-actions[bot]' }, body: '<!-- import-in-the-middle-benchmark -->' }]
      : []
  }
  await execute(require, github, {
    repo: { owner: 'nodejs', repo: 'import-in-the-middle' },
    payload: { workflow_run: { head_sha: original.headSha } }
  }, { info: () => {} })
  return calls
}

try {
  assert.deepEqual(summarize([1, 2, 3]), { mean: 2, median: 2, p95: 3, stddev: 1, cvPercent: 50 })
  assert.equal(summarize([1, 2, 3, 100]).median, 2.5)
  const paired = [
    { base: { wallMs: 1, cpuMs: 1 }, head: { wallMs: 2, cpuMs: 2 } },
    { base: { wallMs: 10, cpuMs: 10 }, head: { wallMs: 5, cpuMs: 5 } },
    { base: { wallMs: 100, cpuMs: 100 }, head: { wallMs: 200, cpuMs: 200 } }
  ]
  assert.equal(compare([paired, paired]).changePercent, 100)
  const comparison = compare(trials)
  assert.ok(Math.abs(comparison.changePercent - 10) < 1e-10)
  assert.ok(comparison.stable)
  assert.equal(compare(trials.slice(0, 2)).stable, false)
  assert.equal(compare(trials.map(
    /** @param {Pair[]} trial */
    trial => trial.slice(0, 2))).stable, false)
  const noisy = structuredClone(trials)
  for (let index = 0; index < noisy.length; index++) {
    for (const observation of noisy[index]) observation.head.wallMs = index % 2 === 0 ? 100 : 140
  }
  assert.equal(compare(noisy).stable, false)
  assert.deepEqual(parse(original), original)
  const text = formatReports([original])
  assert.ok(text.includes('+10.00%'))
  const faster = structuredClone(original)
  for (const benchmark of faster.benchmarks) {
    for (const trial of benchmark.trials) {
      for (const observation of trial) observation.head.wallMs = 90
    }
  }
  assert.ok(formatReports([parse(faster)]).includes('-10.00%'))
  const slowStarts = structuredClone(trials)
  for (const trial of slowStarts) trial[0].head.wallMs = 1000
  const typical = compare(slowStarts)
  assert.ok(Math.abs(typical.changePercent - 10) < 1e-10)
  assert.ok(typical.head.mean > 110)
  assert.ok(typical.head.stddev > 100)
  const forgedSummary = structuredClone(original)
  forgedSummary.benchmarks[0].summary = { changePercent: -50 }
  assert.ok(formatReports([parse(forgedSummary)]).includes('+10.00%'))
  const unstable = structuredClone(original)
  unstable.benchmarks[0].trials = noisy
  assert.ok(formatReports([parse(unstable)]).includes('| Unstable |'))

  for (const field of ['formatVersion', 'workloadVersion', 'prNumber', 'baseSha', 'headSha', 'mergeSha',
    'nodeVersion', 'platform', 'arch', 'selective', 'synchronous']) {
    const report = structuredClone(original)
    report[field] = undefined
    assert.throws(() => parse(report), /Invalid benchmark metadata/)
  }
  for (const value of [undefined, [], [original.benchmarks[0]]]) {
    assert.throws(() => parse({ ...original, benchmarks: value }), /Invalid benchmark scenarios/)
  }
  for (const count of [1, 21]) {
    const report = structuredClone(original)
    report.benchmarks[0].trials = Array.from({ length: count }, () => [pair, pair])
    assert.throws(() => parse(report), /Invalid benchmark trials/)
  }
  for (const count of [2, 20]) {
    const report = structuredClone(original)
    report.benchmarks[0].trials = Array.from({ length: count }, () => [pair, pair])
    assert.equal(parse(report).benchmarks[0].trials.length, count)
  }
  for (const count of [1, 101]) {
    const report = structuredClone(original)
    report.benchmarks[0].trials = [Array.from({ length: count }, () => pair), [pair, pair]]
    assert.throws(() => parse(report), /Invalid benchmark runs/)
  }
  for (const count of [2, 100]) {
    const report = structuredClone(original)
    report.benchmarks[0].trials = Array.from({ length: 2 }, () => Array.from({ length: count }, () => pair))
    assert.equal(parse(report).benchmarks[0].trials[0].length, count)
  }
  for (const field of ['wallMs', 'cpuMs']) {
    const limit = field === 'wallMs' ? 30000 : 1000000
    const accepted = structuredClone(original)
    accepted.benchmarks[0].trials[0][0].head[field] = limit
    assert.equal(parse(accepted).benchmarks[0].trials[0][0].head[field], limit)
    for (const value of [0, -1, null, '1', limit + 1]) {
      const report = structuredClone(original)
      report.benchmarks[0].trials[0][0].head[field] = value
      assert.throws(() => parse(report), /Invalid benchmark sample/)
    }
  }
  const mismatched = structuredClone(original)
  mismatched.benchmarks[0].trials[0].pop()
  assert.throws(() => parse(mismatched), /Inconsistent benchmark runs/)
  writeFileSync(filename, '{}')
  truncateSync(filename, 8 * 1024 * 1024 + 1)
  assert.throws(() => readReport(filename), /too large/)

  process.env.GITHUB_WORKSPACE = root
  process.env.ARTIFACT_DIRECTORY = directory
  process.env.WORKFLOW_RUN_ID = '123'
  for (const major of [22, 24]) {
    const artifactDirectory = join(directory, `benchmark-report-node${major}`)
    mkdirSync(artifactDirectory)
    writeFileSync(join(artifactDirectory, 'report.json'), JSON.stringify({
      ...original, nodeVersion: `v${major}.23.3`
    }))
  }
  const created = (await publish())[0]
  assert.equal(created.operation, 'create')
  assert.equal(created.input.issue_number, 293)
  assert.match(created.input.body, /import-in-the-middle-benchmark/)
  assert.match(created.input.body, /\+10\.00%/)
  assert.match(created.input.body, /actions\/runs\/123/)
  const updated = (await publish({ existing: true }))[0]
  assert.equal(updated.operation, 'update')
  assert.equal(updated.input.comment_id, 7)
  assert.equal((await publish({ payloadBase: 'd'.repeat(40) }))[0].operation, 'create')
  for (const options of [{ head: 'c'.repeat(40) }, { merge: 'd'.repeat(40) }, { state: 'closed' }]) {
    assert.deepEqual(await publish(options), [])
  }
  for (const options of [{ base: 'd'.repeat(40) }, { parents: [] },
    { parents: [original.baseSha] }, { parents: [original.baseSha, 'd'.repeat(40)] }]) {
    const calls = []
    await assert.rejects(publish(options, calls),
      /** @param {Error} error */
      error => {
        assert.deepEqual(calls, [])
        return error.message === 'Mismatched benchmark merge parents'
      })
  }
  const artifact = join(directory, 'benchmark-report-node24/report.json')
  for (const fields of [{ headSha: 'c'.repeat(40) }, { baseSha: 'c'.repeat(40) }, { prNumber: 294 },
    { mergeSha: 'd'.repeat(40) }]) {
    writeFileSync(artifact, JSON.stringify({ ...original, ...fields }))
    await assert.rejects(publish(), /Mismatched benchmark sources/)
  }
  writeFileSync(artifact, JSON.stringify({ ...original, nodeVersion: 'v22.23.3' }))
  await assert.rejects(publish(), /Unexpected Node version/)

  for (const argumentsList of [['--runs', '1'], ['--runs', '101'], ['--trials', '1'], ['--trials', '21'],
    ['--unknown', '2'], ['--output'], ['--scenario', 'missing']]) {
    const result = run(argumentsList)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Expected|Unknown/)
  }
  assert.equal(run(['--help']).status, 0)
  const selected = run(['--runs', '2', '--trials', '2', '--scenario', 'small/none'])
  assert.equal(selected.status, 0, selected.stderr)
  assert.equal(JSON.parse(selected.stdout).benchmarks.length, 1)
  const missingRoot = run(['--runs', '2', '--trials', '2', '--scenario', 'small/async-inactive',
    '--package-directory', join(directory, 'missing')])
  assert.notEqual(missingRoot.status, 0)
  assert.match(missingRoot.stderr, /Benchmark process failed/)
  const warningRoot = join(directory, 'warning')
  mkdirSync(warningRoot)
  writeFileSync(join(warningRoot, 'hook.mjs'),
    "process.emitWarning('failed to wrap benchmark module')\nexport {}\n")
  const warning = run(['--runs', '2', '--trials', '2', '--scenario', 'small/async-inactive',
    '--package-directory', warningRoot])
  assert.notEqual(warning.status, 0)
  assert.match(warning.stderr, /Benchmark emitted warnings.*failed to wrap benchmark module/)
  const blockedRoot = join(directory, 'blocked')
  mkdirSync(blockedRoot)
  writeFileSync(join(blockedRoot, 'hook.mjs'),
    'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)\nexport {}\n')
  const blocked = run(['--runs', '2', '--trials', '2', '--scenario', 'small/async-inactive',
    '--package-directory', blockedRoot])
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /Benchmark process failed: .*ETIMEDOUT/)
  const result = run(['--runs', '2', '--trials', '2', '--output', filename])
  assert.equal(result.status, 0, result.stderr)
  const raw = JSON.parse(readFileSync(filename, 'utf8'))
  assert.equal(raw.formatVersion, 2)
  assert.deepEqual(raw.benchmarks.map(
    /** @param {Benchmark} benchmark */
    benchmark => benchmark.name),
  getScenarios(raw.selective, raw.synchronous).map(
    /** @param {Scenario} scenario */
    scenario => scenario.name))
  for (const benchmark of raw.benchmarks) {
    assert.equal(benchmark.trials.length, 2)
    assert.equal(benchmark.trials[0].length, 2)
    assert.equal(benchmark.summary.stable, false)
    assert.ok(benchmark.trials[0][0].base.cpuMs > 0)
  }
  console.log('Benchmark protocol, statistics, CLI, and all available loader modes passed.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
