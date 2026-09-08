import { spawn } from 'node:child_process'
import { join } from 'node:path'

/**
 * @param {object} options The Next.js server options.
 * @param {string} options.appDirectory The Next.js application directory.
 * @param {string[]} options.arguments The Next.js command arguments.
 * @param {string} options.hookSetup The CommonJS hook setup path.
 * @param {string} options.iitmDirectory The IITM package directory.
 * @param {string} options.nextBin The Next.js executable path.
 * @param {number} options.port The server port.
 * @param {(url: string) => Promise<void>} verify Verifies the application route.
 * @returns {Promise<void>}
 */
export function runTurbopackServer (options, verify) {
  return new Promise((resolve, reject) => {
    const server = spawn(options.nextBin, options.arguments, {
      cwd: options.appDirectory,
      env: {
        ...process.env,
        NODE_OPTIONS: `--no-warnings --experimental-loader ${join(options.iitmDirectory, 'hook.mjs')} --require ${options.hookSetup}`,
        IITM_PATH: join(options.iitmDirectory, 'index.js')
      }
    })

    let output = ''
    let hookSeen = false
    let verificationStarted = false
    let verificationComplete = false
    let settled = false

    /** @param {Error} [error] The verification failure. */
    function finish (error) {
      if (settled || (error === undefined && (!hookSeen || !verificationComplete))) return
      settled = true
      clearTimeout(timeout)
      server.kill()
      if (error === undefined) resolve()
      else reject(error)
    }

    async function verifyRoute () {
      try {
        await verify(`http://localhost:${options.port}/api/foo`)
        verificationComplete = true
        finish()
      } catch (error) {
        finish(error)
      }
    }

    /** @param {Buffer} chunk The server output chunk. */
    function onData (chunk) {
      const text = chunk.toString()
      output += text

      if (!verificationStarted && /ready/i.test(text)) {
        verificationStarted = true
        verifyRoute()
      }
      if (!hookSeen && output.includes('IITM_HOOK_TRIGGERED:camelcase')) {
        hookSeen = true
        finish()
      }
    }

    /** @param {Error} error The child-process failure. */
    function onError (error) {
      finish(error)
    }

    function onClose () {
      if (!settled) finish(new Error(`Turbopack server exited before verification completed. Output:\n${output}`))
    }

    function onTimeout () {
      finish(new Error(`Timed out waiting for Turbopack. Output:\n${output}`))
    }

    server.stdout.on('data', onData)
    server.stderr.on('data', onData)
    server.on('error', onError)
    server.on('close', onClose)
    const timeout = setTimeout(onTimeout, 30_000)
  })
}
