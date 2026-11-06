module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use an explicit branch when a conditional expression spans multiple lines' },
    schema: [],
    messages: {
      useBranch: 'Use an if/else branch instead of a multiline conditional expression.'
    }
  },

  /** @param {import('eslint').Rule.RuleContext} context */
  create (context) {
    return {
      /** @param {import('estree').ConditionalExpression} node */
      ConditionalExpression (node) {
        if (node.loc.start.line !== node.loc.end.line) {
          context.report({ node, messageId: 'useBranch' })
        }
      }
    }
  }
}
