export function buildFailedGenerationState({ errorMessage, summaryMessage = '' }) {
  const combinedError = summaryMessage
    ? `${errorMessage}\n\n${summaryMessage}`
    : errorMessage

  return {
    asset: null,
    generatedCode: null,
    spec: null,
    proceduralSchema: null,
    proceduralParams: {},
    creativeTextureSlots: [],
    error: combinedError
  }
}

export function buildSuccessfulCreativeGenerationState({ code, asset }) {
  return {
    generatedCode: code,
    asset,
    spec: null,
    generationMode: 'creative'
  }
}
