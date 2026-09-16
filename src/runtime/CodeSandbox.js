/** Generated source is always executed outside the application realm. */
import { executeIsolated } from './isolated/client.js'

export const executeCode = executeIsolated

export function normalizeCreativeCode(text) {
  if (typeof text !== 'string') {
    return null
  }

  let code = text.trim()
  if (code.startsWith('```')) {
    code = code.replace(/^```(?:javascript|js)?\n?/, '').replace(/\n?```$/, '')
  }

  const start = code.indexOf('function createAsset')
  if (start === -1) {
    return null
  }

  return code.slice(start).trim()
}
