import { spawnSync } from 'child_process'

spawnSync(process.execPath, ['--import', './test/fixtures/import.mjs', './test/fixtures/import-after.mjs'], { stdio: 'inherit' })
