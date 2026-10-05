const { EventEmitter } = require('node:events')

module.exports = class Clock extends EventEmitter {
  /** @param {Date} date Date to copy. */
  copy (date) {
    return new Date(date.getTime())
  }
}
