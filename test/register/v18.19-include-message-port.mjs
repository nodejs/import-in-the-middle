import { spawnSync } from 'child_process'

const out = spawnSync(process.execPath,
  ['--import', './test/fixtures/import.mjs', './test/fixtures/import-after.mjs'],
  { stdio: 'inherit', env: {} }
)
process.exit(out.status)
