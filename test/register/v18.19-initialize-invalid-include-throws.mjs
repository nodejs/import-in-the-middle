import { strictEqual } from 'assert'
import { register } from 'module'

let saw = false
try {
  register('../../hook.mjs', import.meta.url, { data: { include: ['./relative-not-allowed'] } })
} catch (err) {
  saw = true
  strictEqual(String(err.message).includes("'include' option only supports"), true)
}

strictEqual(saw, true)
