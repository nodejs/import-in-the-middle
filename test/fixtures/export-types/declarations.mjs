const o = { name5: 1, name6: 1 };
const array = [1, 1]

// Exporting declarations
export let name1 = 1, name2 = 1/*, … */; // also var
export const name3 = 1, name4 = 1/*, … */; // also var, let
export function functionName() { return 1 }
export class ClassName { getFoo() { return 1 } }
export function* generatorFunctionName() { return 1 }
export const { name5, name6: bar } = o;
export const [ name7, name8 ] = array;
