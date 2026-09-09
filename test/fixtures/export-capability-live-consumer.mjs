import { Alias, Late, init, state } from './export-capability-live.mjs'

init()

export class Sub extends Late {}
export class AliasSub extends Alias {}
export { state }
