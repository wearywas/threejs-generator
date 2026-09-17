function validationIssues(message) {
  const isIssue = issue => issue && typeof issue.code === 'string' && Array.isArray(issue.path)
  if (!message.startsWith('[')) return []
  try {
    const issues = JSON.parse(message)
    return Array.isArray(issues) ? issues.filter(isIssue) : []
  } catch {
    // Worker errors are capped at 2,000 characters. A complete first issue can
    // still explain a cut-off list; never guess fields from an incomplete issue.
    const prefix = message.slice(1, 2000)
    for (let end = prefix.indexOf('}'); end !== -1; end = prefix.indexOf('}', end + 1)) {
      try {
        const issue = JSON.parse(prefix.slice(0, end + 1))
        if (isIssue(issue)) return [issue]
      } catch { /* Keep looking for the end of the first complete object. */ }
    }
    return []
  }
}

/** Display-only explanations. Original diagnostics stay with the repair policy. */
export function summarizeRetryReason(reason) {
  const message = typeof reason === 'string' ? reason.trim() : ''
  if (!message) return ''

  const issues = validationIssues(message)
  if (issues.some(issue => issue.path[0] === 'runtimeSignals' && issue.path[1] === 'bounds')) {
    return 'The generated model has an invalid size or position, so it could not be displayed.'
  }
  if (issues.some(issue => ['params', 'schema'].includes(issue.path[0]))) {
    return 'Some of the model settings are missing or invalid.'
  }
  if (issues.length) return 'The generated result did not match the required format.'

  if (message.startsWith('Failed to parse code:')) return 'The generated code contains a syntax error and could not run.'
  if (message.startsWith('Execution failed:')) {
    if (/is not defined\b/.test(message)) return 'The generated code uses a value that was never defined.'
    if (/is not a (?:function|constructor)\b/.test(message)) return 'The generated code tried to use an unavailable operation.'
    return 'The generated code stopped with an error while building the model.'
  }
  if (message.startsWith('Triangle count (')) return 'The generated model exceeds the current detail limit.'
  if (message.startsWith('Code contains potentially dangerous pattern:')) return "The generated code did not pass the preview's safety checks."
  if (/^Asset \w+ timed out;/.test(message)) return 'The generated code took too long to build the model.'
  if (message.startsWith('Invalid JSON')) return 'The response could not be read in the required format.'
  if (message === 'No text content in response') return 'The model returned no usable content.'
  if (message === 'Response missing "schema" field') return 'The response is missing the information needed for editable controls.'
  if (/^(?:Code must start with|Expected createAsset code|Code did not produce a function|Function must return an object|Result must have a "root" property|Response missing "code" field)/.test(message)) {
    return 'The response did not contain a usable 3D model.'
  }
  return 'The previous result could not be used.'
}
