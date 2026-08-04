exports.name = 'b'

const a = require('./sync-commonjs-cycle-a.cjs')

exports.fromA = a.name
