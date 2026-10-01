export type OnlyAType = { a: number }
export interface AlsoAType { b: string }
export type { Debugger } from 'node:inspector'

export const alpha: number = 1, beta: string = 'two'

export function gamma (n: number): number {
  return n + alpha
}

export class Delta {
  value: number = 3
}

type GenericCast<T, U> = T

export const castAlpha = 1 as GenericCast<number, unknown>
export const castBeta = 2 as GenericCast<number, unknown>
