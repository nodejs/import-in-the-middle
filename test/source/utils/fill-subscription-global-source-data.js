global.subscriptionSourceData = []
const dc = require('diagnostics_channel')

dc.subscribe('iitm:source:preload', function (message) {
  console.log('hello iitm:source:preload url:', message.url)
  global.subscriptionExecuted = true
})

console.log('fill-subscription-global-source-data subscribed')
