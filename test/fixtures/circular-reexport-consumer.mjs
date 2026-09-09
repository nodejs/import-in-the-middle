import 'node:assert'

import { UserError } from './circular-reexport-barrel.mjs'
import { UserError as AliasedUserError } from '#circular-reexport-barrel'

export class RegistryError extends UserError {}
export const sameUserError = AliasedUserError === UserError
export function importCircularExports () {
  return import('./circular-reexport-barrel.mjs')
}
