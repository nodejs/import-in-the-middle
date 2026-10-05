import { testNativeCycle } from '../fixtures/native-cycle-test.mjs'

// Node.js 24 links synchronously before import() returns, so the second import cannot release the paused load.
if (Number(process.versions.node.split('.')[0]) === 24) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: native linking prevents this race on Node.js 24`)
} else {
  await testNativeCycle('race')
}
