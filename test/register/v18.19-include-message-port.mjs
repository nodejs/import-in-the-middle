import { spawnSync } from 'child_process'

const out = spawnSync(process.execPath,
  ['--import', './test/fixtures/import.mjs', './test/fixtures/import-after.mjs'],
  { stdio: 'inherit', env: {} }
)

if (out.error) {
  console.error(out.error)
}
if (out.status !== 0) {
  console.error(out.stderr.toString())
}
process.exit(out.status)
