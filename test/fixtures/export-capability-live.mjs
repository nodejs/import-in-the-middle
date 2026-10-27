export const state = { hookCount: 0 }
export let Late

export function init () {
  Late = class Late {}
}

export { Late as Alias }
