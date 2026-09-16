const DEFAULT_MODEL = 'claude-fable-5-1'
const DEFAULT_CREATIVE_MODEL = 'claude-fable-5-1'

export function getAnthropicModelForTask(task, env = {}) {
  const normalizedTask = String(task || '').toUpperCase()
  if (env[`ANTHROPIC_MODEL_${normalizedTask}`]) return env[`ANTHROPIC_MODEL_${normalizedTask}`]
  if (env.ANTHROPIC_MODEL) return env.ANTHROPIC_MODEL
  const taskSpecificKey = `VITE_ANTHROPIC_MODEL_${normalizedTask}`

  if (env[taskSpecificKey]) {
    return env[taskSpecificKey]
  }

  if (env.VITE_ANTHROPIC_MODEL) {
    return env.VITE_ANTHROPIC_MODEL
  }

  if (task === 'creative') {
    return DEFAULT_CREATIVE_MODEL
  }

  return DEFAULT_MODEL
}
