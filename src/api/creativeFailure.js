const CRITIC_PREFIX = 'Creative critic rejected the asset:'
const DANGEROUS_PATTERN_PREFIX = 'Code contains potentially dangerous pattern:'

function extractDangerousPattern(message) {
  const match = message.match(/Code contains potentially dangerous pattern:\s*(.+)$/)
  return match?.[1] || null
}

export function classifyCreativeFailure(error) {
  const message = error?.message || 'Unknown generation failure'

  if (message.includes(DANGEROUS_PATTERN_PREFIX)) {
    return {
      category: 'sandbox_validation',
      retryMode: 'repair',
      message,
      diagnostics: {
        offendingPattern: extractDangerousPattern(message)
      }
    }
  }

  if (message.startsWith('Execution failed:') || message.startsWith('Failed to parse code:')) {
    return {
      category: 'runtime_execution',
      retryMode: 'repair',
      message,
      diagnostics: {}
    }
  }

  if (
    message === 'Function must return an object' ||
    message.includes('Result must have a "root" property') ||
    message.startsWith('Triangle count (')
  ) {
    return {
      category: 'runtime_execution',
      retryMode: 'repair',
      message,
      diagnostics: {}
    }
  }

  if (message.startsWith(CRITIC_PREFIX)) {
    return {
      category: 'critic_rejection',
      retryMode: 'regenerate',
      message,
      diagnostics: {
        criticFeedback: message.replace(CRITIC_PREFIX, '').trim()
      }
    }
  }

  if (message.includes('No text content in response') || message.includes('Invalid JSON')) {
    return {
      category: 'model_response',
      retryMode: 'retry',
      message,
      diagnostics: {}
    }
  }

  return {
    category: 'unknown',
    retryMode: 'retry',
    message,
    diagnostics: {}
  }
}

export function planCreativeRetry({
  prompt,
  lastCode,
  failure,
  maxAttempts,
  attemptIndex,
  repairsUsed = 0,
  criticRegenerationsUsed = 0
}) {
  if (attemptIndex >= maxAttempts) {
    return { action: 'stop', reason: 'maximum attempts reached' }
  }

  if (failure.retryMode === 'repair') {
    if (!lastCode || repairsUsed >= maxAttempts - 1) {
      return { action: 'stop', reason: 'no repair budget remaining' }
    }

    return {
      action: 'repair',
      promptKind: 'repair',
      prompt,
      lastCode,
      failure
    }
  }

  if (failure.retryMode === 'regenerate') {
    if (criticRegenerationsUsed >= 2) {
      return { action: 'stop', reason: 'critic regeneration budget exhausted' }
    }

    return {
      action: 'retry',
      promptKind: 'critic_regenerate',
      prompt,
      lastCode,
      failure
    }
  }

  return {
    action: attemptIndex < maxAttempts ? 'retry' : 'stop',
    promptKind: 'retry',
    prompt,
    lastCode,
    failure
  }
}

export function summarizeCreativeAttempts(attempts) {
  const categories = {}
  let totalDurationMs = 0

  attempts.forEach(attempt => {
    if (attempt?.category) {
      categories[attempt.category] = (categories[attempt.category] || 0) + 1
    }
    totalDurationMs += attempt?.durationMs || 0
  })

  const parts = Object.entries(categories).map(([category, count]) => `${category} x${count}`)

  return {
    totalAttempts: attempts.length,
    totalDurationMs,
    categories,
    message: attempts.length === 0
      ? 'no attempts recorded'
      : `failed after ${attempts.length} attempts: ${parts.join(', ')}`
  }
}
