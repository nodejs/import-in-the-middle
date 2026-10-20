// Overload signatures are reported as separate exports by es-module-lexer.
export function any (value: string): string
export function any (value: number): number
export function any (value: string | number): string | number {
  return value
}

export const other = 1
