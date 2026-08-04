import { ok, strictEqual } from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { nodeFileTrace } from '@vercel/nft'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const { fileList, warnings } = await nodeFileTrace(['register-hooks.mjs'], { base: packageRoot })

strictEqual(warnings.size, 0)
ok(fileList.has('register-hooks.mjs'))
ok(fileList.has('create-hook.mjs'))
ok(fileList.has('lib/register.js'), 'the generated wrapper runtime must remain reachable to file tracers')
