// Fixture for testing that CJS require('node:events') still returns a usable
// constructor when IITM has wrapped node:events. Used by the v22+ test for
// the module.exports shim fallback.
const EventEmitter = require('node:events')
module.exports = class Foo extends EventEmitter {}
