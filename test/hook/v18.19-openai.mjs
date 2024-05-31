import OpenAI from 'openai'
import Hook from '../../index.js'

Hook((exports, name) => {
  if (name === 'openai') {
    console.assert(name, exports)
  }
})

console.assert(OpenAI)
