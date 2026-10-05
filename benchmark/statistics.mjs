/** @typedef {{ wallMs: number, cpuMs: number }} Sample */
/** @typedef {{ base: Sample, head: Sample }} Pair */

export const sampling = Object.freeze({
  minTrials: 2, trials: 8, maxTrials: 20, minRuns: 2, runs: 20, maxRuns: 100, cvPercent: 2
})

/** @param {number[]} values Independent observations. */
export function summarize (values) {
  const mean = values.reduce(
    /**
     * @param {number} sum
     * @param {number} value
     */
    (sum, value) => sum + value, 0) / values.length
  const variance = values.reduce(
    /**
     * @param {number} sum
     * @param {number} value
     */
    (sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  const sorted = [...values].sort(
    /**
     * @param {number} left
     * @param {number} right
     */
    (left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
  return {
    mean,
    median,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    stddev: Math.sqrt(variance),
    cvPercent: 100 * Math.sqrt(variance) / mean
  }
}

/** @param {Pair[][]} trials Paired observations grouped by trial. */
export function compare (trials) {
  const ratios = []
  const base = []
  const head = []
  for (const trial of trials) {
    const trialRatios = []
    for (const pair of trial) {
      trialRatios.push(pair.head.wallMs / pair.base.wallMs)
      base.push(pair.base.wallMs)
      head.push(pair.head.wallMs)
    }
    ratios.push(summarize(trialRatios).median)
  }
  const ratio = summarize(ratios)
  return {
    base: summarize(base),
    head: summarize(head),
    changePercent: 100 * (ratio.mean - 1),
    ratioCvPercent: ratio.cvPercent,
    changeStddevPercent: 100 * ratio.stddev,
    standardErrorPercent: 100 * ratio.stddev / Math.sqrt(trials.length),
    stable: trials.length >= sampling.trials && trials.every(
      /** @param {Pair[]} trial */
      trial => trial.length >= sampling.runs) &&
      ratio.cvPercent <= sampling.cvPercent
  }
}
