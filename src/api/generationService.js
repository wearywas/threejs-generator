import { createMessage } from './llmClient'
import { generationProgress } from './generationProgress'
import { resolveParams } from '../services/assetDocument'
import { classifyAssetFamily } from '../services/assetFamily'
import { validateSpec } from '../schemas/assetSpec'
import { getSystemPrompt } from '../prompts/systemPrompt'
import {
  getCodeSystemPrompt,
  getRepairPrompt
} from '../prompts/codeSystemPrompt'
import { 
  getConversionPrompt, 
  getAnimationPrompt, 
  getConversionUserMessage, 
  getAnimationUserMessage 
} from '../prompts/convertToProceduralPrompt'
import { getEditSystemPrompt, getEditUserMessage } from '../prompts/editPrompt'
import { executeCode } from '../runtime/CodeSandbox'
import {
  classifyCreativeFailure,
  planCreativeRetry,
  summarizeCreativeAttempts
} from './creativeFailure'

/** Keep progress scoped through response validation and asset execution. */
async function withGenerationProgress(task, maxAttempts, { signal }, generate) {
  signal?.throwIfAborted()
  const progress = generationProgress.start(task, { signal, maxAttempts })
  try {
    return await generate((stage, details) => {
      signal?.throwIfAborted()
      progress.report(stage, details)
    })
  } finally {
    progress.finish()
  }
}

/**
 * Generate an asset specification from a natural language prompt (Tier 1: Curated)
 * @param {string} prompt - User's description of the desired asset
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {Array} examples - Optional few-shot examples from library
 * @param {Object} execOptions - Optional operation cancellation signal
 * @returns {Promise<Object>} Validated asset specification
 */
export async function generateAssetSpec(prompt, maxAttempts = 3, examples = [], execOptions = {}) {
  return withGenerationProgress('spec', maxAttempts, execOptions, async report => {
    const systemPrompt = getSystemPrompt(examples)
    let lastError = null
    let lastResponse = null
    let repairsUsed = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Build messages for this attempt
        const messages = [
          { role: 'user', content: prompt }
        ]

        // If we had a previous error, add it as context
        if (lastError && lastResponse) {
          repairsUsed += 1
          messages[0] = {
            role: 'user',
            content: `${prompt}\n\n[Previous attempt failed with error: ${lastError}. Your response was: ${lastResponse}. Please fix and try again.]`
          }
        }

        // Call the selected provider through the local service.
        report(lastError && lastResponse ? 'repair' : 'model', { attempt: attempt + 1, repairAttempt: repairsUsed, retryReason: lastError || '' })
        const response = await createMessage({
          task: 'spec',
          max_tokens: 4096,
          system: systemPrompt,
          messages
        })

        // Extract text content
        report('validation')
        const textContent = response.content.find(c => c.type === 'text')
        if (!textContent) {
          throw new Error('No text content in response')
        }

        const responseText = textContent.text.trim()
        lastResponse = responseText

        // Try to parse JSON
        let spec
        try {
          // Handle potential markdown code blocks
          let jsonStr = responseText
          if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
          }
          spec = JSON.parse(jsonStr)
        } catch (parseError) {
          throw new Error(`Invalid JSON: ${parseError.message}`)
        }

        // Validate against schema
        const validated = validateSpec(spec)

        return validated

      } catch (error) {
        // API failures and cancellation do not consume paid code-repair attempts.
        if (error.retryable === false || error.name === 'AbortError') throw error
        lastError = error.message
        console.warn(`Attempt ${attempt + 1}/${maxAttempts} failed:`, error.message)

        if (attempt === maxAttempts - 1) {
          throw new Error(`Failed to generate valid spec after ${maxAttempts} attempts: ${error.message}`)
        }
      }
    }
  })
}

/**
 * Generate a creative asset from a natural language prompt (Tier 2: Creative)
 * Uses LLM to generate ThreeJS code and executes it with auto-repair
 * @param {string} prompt - User's description of the desired asset
 * @param {Array} examples - Optional few-shot examples from library
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {Object} execOptions - Options for code execution (e.g., { maxTriangles: Infinity })
 * @returns {Promise<{code: string, asset: Object}>} Generated code and executed asset
 */
export async function generateCreativeAsset(prompt, examples = [], maxAttempts = 3, execOptions = {}, options = {}) {
  return withGenerationProgress('creative', maxAttempts, execOptions, async report => {
    const assetFamily = options.assetFamily ?? execOptions.assetFamily ?? classifyAssetFamily(prompt)
    const systemPrompt = getCodeSystemPrompt(examples, { ...options, assetFamily })
    let lastCode = null
    let lastError = null
    let lastFailure = null
    let promptKind = 'generate'
    let repairsUsed = 0
    const attemptLog = []

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const attemptNumber = attempt + 1
      const startedAt = Date.now()

      try {
        let userMessage = prompt

        if (promptKind === 'repair' && lastCode && lastFailure) {
          userMessage = getRepairPrompt(lastCode, lastError, lastFailure)
        }

        console.info(
          `[Creative] attempt ${attemptNumber}/${maxAttempts} phase=${promptKind}`
        )

        report(promptKind === 'repair' ? 'repair' : 'model', { attempt: attemptNumber, repairAttempt: repairsUsed, retryReason: lastError || '' })
        const response = await createMessage({
          task: 'creative',
          max_tokens: 32000, // Adaptive-thinking headroom + complex buildings/scenes
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })

        // Extract text content
        report('validation')
        const textContent = response.content.find(c => c.type === 'text')
        if (!textContent) {
          throw new Error('No text content in response')
        }

        let code = textContent.text.trim()

        // Remove markdown code blocks if present
        if (code.startsWith('```')) {
          code = code.replace(/^```(?:javascript|js)?\n?/, '').replace(/\n?```$/, '')
        }

        lastCode = code

        // Try to execute the code with provided options
        report('execution')
        const asset = await executeCode(code, { ...execOptions, prompt, assetFamily })

        // The critic is advisory only: it measures and reports, but never gates.
        // As a gate (calibrated on older models' failure modes) it burned full
        // regeneration attempts on false rejections and hid the asset from the
        // user; now the asset always shows, with the critic's notes beside it.
        const evaluation = asset.criticEvaluation
        if (evaluation && !evaluation.accepted) {
          console.info('[Creative] critic notes (advisory):', evaluation.reasons.join(' '))
        }

        attemptLog.push({
          number: attemptNumber,
          phase: promptKind,
          category: null,
          durationMs: Date.now() - startedAt,
          outcome: 'succeeded'
        })

        // Success! Return both code and asset
        return {
          code,
          asset,
          diagnostics: {
            attempts: attemptLog,
            failureSummary: summarizeCreativeAttempts(
              attemptLog.filter(entry => entry.outcome === 'failed')
            )
          }
        }

      } catch (error) {
        // API failures and cancellation do not consume paid code-repair attempts.
        if (error.retryable === false || error.name === 'AbortError') throw error
        lastError = error.message
        lastFailure = classifyCreativeFailure(error)
        const durationMs = Date.now() - startedAt

        attemptLog.push({
          number: attemptNumber,
          phase: promptKind,
          category: lastFailure.category,
          durationMs,
          outcome: 'failed'
        })

        console.warn(
          `[Creative] attempt ${attemptNumber}/${maxAttempts} phase=${promptKind} failed ` +
          `(${lastFailure.category}) in ${durationMs}ms: ${error.message}`
        )

        const nextStep = planCreativeRetry({
          prompt,
          lastCode,
          failure: lastFailure,
          maxAttempts,
          attemptIndex: attemptNumber,
          repairsUsed
        })

        if (nextStep.action === 'repair') {
          repairsUsed += 1
          promptKind = 'repair'
          continue
        }

        if (nextStep.action === 'retry') {
          promptKind = 'generate'
          continue
        }

        const failureSummary = summarizeCreativeAttempts(
          attemptLog.filter(entry => entry.outcome === 'failed')
        )
        const finalError = new Error(
          `Failed to generate working code after ${attemptNumber} attempts: ${error.message}`
        )
        finalError.attemptSummary = failureSummary
        finalError.attempts = attemptLog
        throw finalError
      }
    }
  })
}

/**
 * Convert creative code to procedural code with dynamic parameters
 * @param {string} code - The original creative code
 * @param {string} originalPrompt - The original user prompt
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {Object} execOptions - Options for code execution (e.g., { maxTriangles: Infinity })
 * @param {Object} options - Optional conversion guidance ({ guidance: string }), separate from execution inputs
 * @returns {Promise<{code: string, schema: Object, asset: Object}>}
 */
export async function convertToProceduralAsset(code, originalPrompt, maxAttempts = 3, execOptions = {}, options = {}) {
  return withGenerationProgress('convert', maxAttempts, execOptions, async report => {
    const systemPrompt = getConversionPrompt()
    let lastError = null
    let lastResponse = null
    let repairsUsed = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        let userMessage = getConversionUserMessage(code, originalPrompt, options.guidance)

        // If we had a previous error, add it as context
        if (lastError && lastResponse) {
          repairsUsed += 1
          userMessage += `\n\n[Previous attempt failed with error: ${lastError}. Please fix and try again, outputting ONLY valid JSON.]`
        }

        // Call the selected provider through the local service.
        report(lastError && lastResponse ? 'repair' : 'model', { attempt: attempt + 1, repairAttempt: repairsUsed, retryReason: lastError || '' })
        const response = await createMessage({
          task: 'convert',
          max_tokens: 16384, // Code + schema, plus adaptive-thinking headroom
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })

        // Extract text content
        report('validation')
        const textContent = response.content.find(c => c.type === 'text')
        if (!textContent) {
          throw new Error('No text content in response')
        }

        let responseText = textContent.text.trim()
        lastResponse = responseText

        // Remove markdown code blocks if present
        if (responseText.startsWith('```')) {
          responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }

        // Parse JSON response
        let result
        try {
          result = JSON.parse(responseText)
        } catch (parseError) {
          throw new Error(`Invalid JSON response: ${parseError.message}`)
        }

        // Validate response structure
        if (!result.code || typeof result.code !== 'string') {
          throw new Error('Response missing "code" field')
        }
        if (!result.schema || typeof result.schema !== 'object') {
          throw new Error('Response missing "schema" field')
        }

        const params = resolveParams(result.schema, execOptions.params)
        report('execution')
        const asset = await executeCode(result.code, { ...execOptions, params })

        // Success!
        return {
          code: result.code,
          schema: result.schema,
          params,
          asset
        }

      } catch (error) {
        // API failures and cancellation do not consume paid code-repair attempts.
        if (error.retryable === false || error.name === 'AbortError') throw error
        lastError = error.message
        console.warn(`Conversion attempt ${attempt + 1}/${maxAttempts} failed:`, error.message)

        if (attempt === maxAttempts - 1) {
          throw new Error(`Failed to convert code after ${maxAttempts} attempts: ${error.message}`)
        }
      }
    }
  })
}

/**
 * Add animation to an existing asset
 * @param {string} code - The current code (may or may not have animation)
 * @param {string} originalPrompt - The original user prompt
 * @param {Object} schema - The current parameter schema (if procedural)
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {Object} execOptions - Options for code execution (e.g., { maxTriangles: Infinity })
 * @returns {Promise<{code: string, schema: Object, animationDescription: string, asset: Object}>}
 */
export async function addAnimationToAsset(code, originalPrompt, schema = null, maxAttempts = 3, execOptions = {}) {
  return withGenerationProgress('animate', maxAttempts, execOptions, async report => {
    const systemPrompt = getAnimationPrompt()
    let lastError = null
    let lastResponse = null
    let repairsUsed = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        let userMessage = getAnimationUserMessage(code, originalPrompt, schema)

        // If we had a previous error, add it as context
        if (lastError && lastResponse) {
          repairsUsed += 1
          userMessage += `\n\n[Previous attempt failed with error: ${lastError}. Please fix and try again, outputting ONLY valid JSON.]`
        }

        // Call the selected provider through the local service.
        report(lastError && lastResponse ? 'repair' : 'model', { attempt: attempt + 1, repairAttempt: repairsUsed, retryReason: lastError || '' })
        const response = await createMessage({
          task: 'animate',
          max_tokens: 16384,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })

        // Extract text content
        report('validation')
        const textContent = response.content.find(c => c.type === 'text')
        if (!textContent) {
          throw new Error('No text content in response')
        }

        let responseText = textContent.text.trim()
        lastResponse = responseText

        // Remove markdown code blocks if present
        if (responseText.startsWith('```')) {
          responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }

        // Parse JSON response
        let result
        try {
          result = JSON.parse(responseText)
        } catch (parseError) {
          throw new Error(`Invalid JSON response: ${parseError.message}`)
        }

        // Validate response structure
        if (!result.code || typeof result.code !== 'string') {
          throw new Error('Response missing "code" field')
        }
        if (!result.schema || typeof result.schema !== 'object') {
          throw new Error('Response missing "schema" field')
        }

        const params = resolveParams(result.schema, execOptions.params)
        report('execution')
        const asset = await executeCode(result.code, { ...execOptions, params })

        // Success!
        return {
          code: result.code,
          schema: result.schema,
          animationDescription: result.animationDescription || 'Animation added',
          params,
          asset
        }

      } catch (error) {
        // API failures and cancellation do not consume paid code-repair attempts.
        if (error.retryable === false || error.name === 'AbortError') throw error
        lastError = error.message
        console.warn(`Animation attempt ${attempt + 1}/${maxAttempts} failed:`, error.message)

        if (attempt === maxAttempts - 1) {
          throw new Error(`Failed to add animation after ${maxAttempts} attempts: ${error.message}`)
        }
      }
    }
  })
}

/**
 * Edit an existing asset with a natural language prompt (Generative Edit mode)
 * @param {string} code - The current asset code
 * @param {string} originalPrompt - The original prompt that created this asset
 * @param {string} editRequest - What the user wants to change
 * @param {Object} currentSchema - Current parameter schema (if procedural)
 * @param {Array} currentTextureSlots - Current texture slots (if any)
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {Object} execOptions - Options for code execution (e.g., { maxTriangles: Infinity })
 * @returns {Promise<{code: string, schema: Object, textureSlots: Array, changes: string, asset: Object}>}
 */
export async function editAsset(code, originalPrompt, editRequest, currentSchema = null, currentTextureSlots = null, maxAttempts = 3, execOptions = {}) {
  return withGenerationProgress('edit', maxAttempts, execOptions, async report => {
    const systemPrompt = getEditSystemPrompt()
    let lastError = null
    let lastResponse = null
    let repairsUsed = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        let userMessage = getEditUserMessage(code, originalPrompt, editRequest, currentSchema, currentTextureSlots)

        // If we had a previous error, add it as context
        if (lastError && lastResponse) {
          repairsUsed += 1
          userMessage += `\n\n[Previous attempt failed with error: ${lastError}. Please fix and output valid JSON.]`
        }

        // Call the selected provider through the local service.
        report(lastError && lastResponse ? 'repair' : 'model', { attempt: attempt + 1, repairAttempt: repairsUsed, retryReason: lastError || '' })
        const response = await createMessage({
          task: 'edit',
          max_tokens: 16384,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })

        // Extract text content
        report('validation')
        const textContent = response.content.find(c => c.type === 'text')
        if (!textContent) {
          throw new Error('No text content in response')
        }

        let responseText = textContent.text.trim()
        lastResponse = responseText

        // Remove markdown code blocks if present
        if (responseText.startsWith('```')) {
          responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }

        // Parse JSON response
        let result
        try {
          result = JSON.parse(responseText)
        } catch (parseError) {
          throw new Error(`Invalid JSON response: ${parseError.message}`)
        }

        // Validate response structure
        if (!result.code || typeof result.code !== 'string') {
          throw new Error('Response missing "code" field')
        }

        const nextSchema = result.schema || currentSchema || null
        const params = resolveParams(nextSchema, execOptions.params)
        report('execution')
        const asset = await executeCode(result.code, { ...execOptions, params })

        // Success!
        return {
          code: result.code,
          schema: nextSchema,
          params,
          textureSlots: result.textureSlots || currentTextureSlots || [],
          changes: result.changes || 'Asset updated',
          asset
        }

      } catch (error) {
        // API failures and cancellation do not consume paid code-repair attempts.
        if (error.retryable === false || error.name === 'AbortError') throw error
        lastError = error.message
        console.warn(`Edit attempt ${attempt + 1}/${maxAttempts} failed:`, error.message)

        if (attempt === maxAttempts - 1) {
          throw new Error(`Failed to edit asset after ${maxAttempts} attempts: ${error.message}`)
        }
      }
    }
  })
}

/**
 * Test the API connection
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const response = await createMessage({
      task: 'test',
      system: '',
      max_tokens: 256,
      messages: [{ role: 'user', content: 'Say "ok"' }]
    })
    return response.content[0]?.text?.toLowerCase().includes('ok')
  } catch (error) {
    console.error('API connection test failed:', error)
    return false
  }
}

/**
 * Generate a spec without API (for demo/testing)
 * @param {string} prompt 
 * @returns {Object}
 */
export function generateMockSpec(prompt) {
  const lowercasePrompt = prompt.toLowerCase()
  
  // Simple keyword matching for demo
  if (lowercasePrompt.includes('butterfly') || lowercasePrompt.includes('butterflies')) {
    return {
      generator: 'butterflySwarm',
      params: {
        count: lowercasePrompt.includes('many') ? 15 : 8,
        colors: ['#ff6b9d', '#ffd93d', '#6bcbff', '#ff9f43'],
        flightRadius: 4,
        speed: 1.2,
        wingSpan: 0.35,
        heightVariation: 2
      },
      seed: Math.floor(Math.random() * 100000)
    }
  }
  
  if (lowercasePrompt.includes('tree') || lowercasePrompt.includes('pine')) {
    return {
      generator: 'proceduralTree',
      params: {
        height: lowercasePrompt.includes('tall') ? 10 : 6,
        trunkRadius: 0.35,
        trunkColor: '#5d4037',
        foliageColor: lowercasePrompt.includes('autumn') ? '#ff8a65' : '#2e7d32',
        foliageType: lowercasePrompt.includes('pine') ? 'cone' : 'broadleaf',
        leafCount: 180,
        windSway: true,
        swayAmount: 0.1
      },
      seed: Math.floor(Math.random() * 100000)
    }
  }
  
  if (lowercasePrompt.includes('firefl') || lowercasePrompt.includes('sparkle') || lowercasePrompt.includes('particle')) {
    return {
      generator: 'particleSystem',
      params: {
        type: lowercasePrompt.includes('snow') ? 'snow' : 
              lowercasePrompt.includes('ember') ? 'embers' :
              lowercasePrompt.includes('sparkle') ? 'sparkles' : 'fireflies',
        count: 120,
        area: 6,
        color: lowercasePrompt.includes('snow') ? '#ffffff' : '#ffeb3b',
        speed: 1,
        size: 0.08,
        glow: true
      },
      seed: Math.floor(Math.random() * 100000)
    }
  }
  
  if (lowercasePrompt.includes('cottage') || lowercasePrompt.includes('house') || 
      lowercasePrompt.includes('cabin') || lowercasePrompt.includes('tower') ||
      lowercasePrompt.includes('building')) {
    return {
      generator: 'simpleBuilding',
      params: {
        style: lowercasePrompt.includes('tower') ? 'tower' : 
               lowercasePrompt.includes('cabin') ? 'cabin' :
               lowercasePrompt.includes('shed') ? 'shed' : 'cottage',
        width: 5,
        depth: 4,
        height: lowercasePrompt.includes('tall') ? 5 : 3.5,
        wallColor: '#d7ccc8',
        roofColor: '#795548',
        roofType: lowercasePrompt.includes('tower') ? 'pointed' : 'gabled',
        hasChimney: true,
        hasDoor: true,
        hasWindows: true
      },
      seed: Math.floor(Math.random() * 100000)
    }
  }
  
  if (lowercasePrompt.includes('rock') || lowercasePrompt.includes('stone') || lowercasePrompt.includes('boulder')) {
    return {
      generator: 'rockCluster',
      params: {
        count: lowercasePrompt.includes('many') ? 10 : 5,
        minSize: 0.3,
        maxSize: lowercasePrompt.includes('boulder') ? 2.5 : 1.5,
        spread: 4,
        color: '#757575',
        roughness: 0.85,
        mossAmount: lowercasePrompt.includes('moss') ? 0.6 : 0.2,
        mossColor: '#558b2f'
      },
      seed: Math.floor(Math.random() * 100000)
    }
  }
  
  // Default to butterflies
  return {
    generator: 'butterflySwarm',
    params: {
      count: 6,
      colors: ['#ff6b9d', '#ffd93d', '#6bcbff'],
      flightRadius: 3,
      speed: 1,
      wingSpan: 0.3,
      heightVariation: 1.5
    },
    seed: Math.floor(Math.random() * 100000)
  }
}
