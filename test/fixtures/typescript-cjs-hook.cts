interface Shape { kind: string }
type Label = string
export type ExportedLabel = string

const epsilon: number = 5

function zeta (s: Shape): Label {
  return s.kind
}

module.exports = { epsilon, zeta }
