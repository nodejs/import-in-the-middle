import { spawnSync } from 'child_process'

const out = spawnSync(process.execPath,
  ['--import', './test/fixtures/import-absolute.mjs', './test/fixtures/import-absolute-after.mjs'],
  // Preserve NODE_V8_COVERAGE for c8, but clear NODE_OPTIONS so we don't
  // accidentally inherit the test runner's loader.
  // Also clear IITM_TEST_FILE: when set (by imhotap), test/generic-loader.mjs
  // disables itself for "register" tests, which would deadlock the
  // createAddHookMessageChannel() handshake in the child process.
  { stdio: 'inherit', timeout: 10_000, killSignal: 'SIGKILL', env: { ...process.env, NODE_OPTIONS: '', IITM_TEST_FILE: '' } }
)

if (out.error) {
  console.error(out.error)
}
if (out.signal) {
  console.error(`Child process terminated by signal ${out.signal}`)
}
if (out.status !== 0) {
  console.error(`Expected exit code 0, got ${out.status}`)
}
process.exit(typeof out.status === 'number' ? out.status : 1)
