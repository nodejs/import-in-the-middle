// Imported by the top module *before* the barrel, so the leaf is entered (and
// left on the evaluation stack mid-cycle) ahead of the barrel. This is what
// forces the barrel to evaluate before the leaf finishes, reproducing the
// temporal-dead-zone ordering from typebox (issue #269).
import { Foo } from './star-reexport-tdz-leaf.mjs'

export function useFoo (value) {
  return Foo(value)
}
