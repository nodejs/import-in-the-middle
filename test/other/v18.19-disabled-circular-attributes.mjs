import { testCircularAttributes } from '../fixtures/circular-attributes.mjs'

const [major, minor] = process.versions.node.split('.').map(Number)

if ((major === 18 && minor < 20) || (major === 20 && minor < 10)) {
  console.log(`Skipping ${process.env.IITM_TEST_FILE || import.meta.url}: import attributes unsupported on this Node.js`)
} else {
  await testCircularAttributes('async')
}
