/**
 * @param {boolean} selective Whether asynchronous registration is available.
 * @param {boolean} synchronous Whether synchronous hooks are supported.
 */
export function getScenarios (selective, synchronous) {
  const modes = ['none', 'async-inactive', 'async-active']
  if (selective) modes.push('async-selective', 'async-excluded')
  if (synchronous) modes.push('sync-inactive', 'sync-active', 'sync-selective', 'sync-excluded')
  const scenarios = []
  for (const workload of ['small', 'dependency']) {
    for (const mode of modes) scenarios.push({ name: `${workload}/${mode}`, workload, mode })
  }
  return scenarios
}
