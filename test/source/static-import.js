require('./utils/fill-subscription-global-source-data.js')
const { strictEqual } = require('assert')
;(async function () {
  const sm1 = await import('../fixtures/something.js')
  const sm2 = await import('../fixtures/something.mjs')

  setTimeout(() => {
    console.log('global.hello', global.hello)
  }, 200)
  console.log(`global.subscriptionExecuted: ${global.subscriptionExecuted}`)
  strictEqual(sm1.default(), 42)
  strictEqual(sm2.default(), 42)
})()
