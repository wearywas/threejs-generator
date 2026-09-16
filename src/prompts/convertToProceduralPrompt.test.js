import { describe, expect, it } from 'vitest'
import { getConversionPrompt, getConversionUserMessage } from './convertToProceduralPrompt'
import { getNumericControl, numericControlKey } from '../components/numericControl'

describe('procedural conversion guidance message', () => {
  const automaticMessage = 'Convert this ThreeJS code to accept dynamic parameters.\n\nOriginal prompt: "a cube"\n\nCode to convert:\n```javascript\nfunction createAsset() {}\n```\n\nRemember: Output ONLY the JSON with "code" and "schema" fields. No markdown, no explanation.'

  it.each([undefined, '', ' \t\r\n '])('preserves the exact automatic message for guidance %j', guidance => {
    expect(getConversionUserMessage('function createAsset() {}', 'a cube', guidance)).toBe(automaticMessage)
  })

  it('includes trimmed requested controls in a clearly named optional section', () => {
    const message = getConversionUserMessage('function createAsset() {}', 'a cube', ' \nWidth and color\nKeep the lid attached.\t ')
    expect(message).toContain('\n\n## Requested Controls (optional)\nWidth and color\nKeep the lid attached.\n\n')
    expect(message).toContain('Original prompt: "a cube"')
    expect(message).toContain('```javascript\nfunction createAsset() {}\n```')
    expect(message).toMatch(/Remember: Output ONLY the JSON with "code" and "schema" fields\. No markdown, no explanation\.$/)
  })
})

describe('procedural conversion example', () => {
  const example = JSON.parse(getConversionPrompt().split('\nOutput:\n')[1])

  it('teaches explicit integer counts even with a non-count display label', () => {
    expect(example.schema.segments.type).toBe('integer')
    const control = getNumericControl(example.schema.segments, 'segments')
    expect(numericControlKey(32, 'ArrowRight', control)).toBe(33)
  })

  it('teaches an explicit positive decimal increment for continuous parameters', () => {
    expect(example.schema.radius.step).toBe(0.01)
    const control = getNumericControl(example.schema.radius, 'radius')
    expect(numericControlKey(1.5, 'ArrowRight', control)).toBe(1.51)
  })
})
