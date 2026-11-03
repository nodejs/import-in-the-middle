import { register, supportsSyncHooks } from '../../register-hooks.mjs'
import { testCircularStarInitialization } from '../fixtures/circular-star-initialization-test.mjs'

if (!supportsSyncHooks()) {
  console.log('Skipping: synchronous hooks unsupported on this Node.js')
  process.exit(0)
}

register()
await testCircularStarInitialization(false)
