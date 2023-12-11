// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

import { spawn } from 'child_process'
import { strictEqual } from 'assert'

const nodeProcess = spawn('node', [
  '--loader', 
  './hook.mjs', 
  './test/fixtures/reassign-let.mjs'
])

const expectedOutput = 'setting env, env.FOO is bar\nusing env from another module, env.FOO is bar'
let stdout = ''
let stderr = ''

nodeProcess.stdout.on('data', (data) => {
  stdout += data.toString()
})

nodeProcess.stderr.on('data', (data) => {
  stderr += data.toString()
})

nodeProcess.on('close', (code) => {
  strictEqual(stderr, '', 'There should be no errors on stderr')
  strictEqual(stdout.trim(), expectedOutput, 'The stdout should match the expected output')
})
