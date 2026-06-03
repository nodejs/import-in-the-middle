// Middle CJS module — requires cjs-transitive-c.js.
// This simulates is-generator-function requiring has-tostringtag.
const c = require('./cjs-transitive-c.js')
module.exports.fromC = c.value
module.exports.own = 'middle'
