import './reexport-tdz-cycle-b.mjs'

// Export the binding before it's initialized so cyclic access can hit TDZ.
export let RunTree

// Defer initialization with a timeout. This means that by the time an `import()`
// resolves, native ESM will have initialized the binding, but IITM's wrapper may
// have snapshotted it too early.
setTimeout(() => {
  RunTree = class RunTree {
    constructor () {
      this.ok = true
    }
  }
}, 5)
