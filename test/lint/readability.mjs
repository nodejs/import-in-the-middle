import assert from 'node:assert/strict'

import { ESLint } from 'eslint'

const eslint = new ESLint({ rulePaths: ['tools/eslint'] })
const [invalid] = await eslint.lintText(`export function append (values, enabled) {
  return (values ??= []).push(enabled
    ? 1
    : 0)
}
`, { filePath: 'example.mjs' })
const assignment = invalid.messages.find(
  /** @param {import('eslint').Linter.LintMessage} message */
  message => message.ruleId === 'sonarjs/no-nested-assignment'
)
const conditional = invalid.messages.find(
  /** @param {import('eslint').Linter.LintMessage} message */
  message => message.ruleId === 'no-multiline-ternary'
)
assert.strictEqual(assignment?.line, 2)
assert.strictEqual(conditional?.line, 2)

const [valid] = await eslint.lintText(`export function append (values, enabled) {
  values ??= []
  values.push(enabled ? 1 : 0)
  return values
}
`, { filePath: 'example.mjs' })
assert.deepStrictEqual(valid.messages, [])
