// Top-level CJS module — requires cjs-transitive-b.js.
// This simulates koa requiring is-generator-function.
const b = require('./cjs-transitive-b.js')
module.exports.fromB = b.own
module.exports.fromC = b.fromC
module.exports.own = 'top'
