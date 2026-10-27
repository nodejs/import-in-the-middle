import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { strictEqual } from 'assert'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '..', 'fixtures', 'test-nextjs-app')
const iitmDir = path.resolve(__dirname, '..', '..')
const hookSetup = path.join(appDir, 'iitm-hook-setup.mjs')
const PORT = 3099

if (!existsSync(path.join(appDir, 'node_modules'))) {
  console.log('Installing Next.js app dependencies')
  execSync('npm install', { cwd: appDir })
}

const hookTriggered = await new Promise((resolve, reject) => {
  console.log(`Starting Next.js server on port ${PORT} via \`next dev\``)
  const server = spawn(
    path.join(appDir, 'node_modules', '.bin', 'next'),
    ['dev', '--port', String(PORT)],
    {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_OPTIONS: `--no-warnings --import ${hookSetup}`,
        IITM_PATH: path.join(iitmDir, 'index.js')
      }
    }
  )

  let output = ''
  let hookSeen = false
  let requestMade = false

  function onData (chunk) {
    const text = chunk.toString()
    output += text

    if (!requestMade && /ready/i.test(text)) {
      requestMade = true
      console.log('Server is ready, hitting /api/foo')
      fetch(`http://localhost:${PORT}/api/foo`).catch(() => {})
    }

    if (!hookSeen && output.includes('IITM_HOOK_TRIGGERED:camelcase')) {
      hookSeen = true
      server.kill()
      resolve(true)
    }
  }

  server.stdout.on('data', onData)
  server.stderr.on('data', onData)
  server.on('error', reject)
  server.on('close', () => {
    if (!hookSeen) {
      reject(new Error(`Hook was not triggered. Output:\n${output}`))
    }
  })

  setTimeout(() => {
    if (!hookSeen) {
      server.kill()
      reject(new Error(`Timed out waiting for hook. Output:\n${output}`))
    }
  }, 30_000)
})

strictEqual(hookTriggered, true)
