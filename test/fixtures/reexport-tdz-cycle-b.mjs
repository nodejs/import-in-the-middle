import { RunTree } from './reexport-tdz-cycle-a.mjs'

// Re-exporting an imported live binding.
export { RunTree }

export function make () {
  return new RunTree()
}
