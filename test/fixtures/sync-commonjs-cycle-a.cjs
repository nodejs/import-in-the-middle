exports.name = 'a'

const b = require('./sync-commonjs-cycle-b.cjs')

exports.fromB = b.name
exports.seenByB = b.fromA
