import { execSync } from 'child_process'
import { doesNotThrow } from 'assert'

const env = {
  ...process.env,
  NODE_OPTIONS: '--no-warnings --experimental-loader ./test/fixtures/entrypoint-iitm-query-loader.mjs'
}

doesNotThrow(() => {
  execSync('node ./test/fixtures/entrypoint-query.mjs', { env })
})
