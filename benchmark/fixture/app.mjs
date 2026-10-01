import { value as a } from './a.mjs'
import { value as b } from './b.mjs'
import { value as c } from './c.mjs'
import { value as d } from './d.mjs'
import { value as e } from './e.mjs'
import { value as f } from './f.mjs'
import { value as g } from './g.mjs'
import { value as h } from './h.mjs'

const expected = process.env.IITM_BENCHMARK_ACTIVE === '1' ? 88 : 87
const sum = a + b + c + d + e + f + g + h

if (sum !== expected) {
  throw new Error(`Unexpected fixture result: ${sum}`)
}
