import { helper } from './circular-star-initialization-helper.mjs'

export const number = 42
export const missing = undefined
export const overridden = 'original'

export function replaceable () {
  return 'original'
}

export function value () {
  return helper()
}
