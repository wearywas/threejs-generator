import { generatorSchemas } from '../schemas/assetSpec'

/**
 * Generates the system prompt for Claude with available generators and their schemas
 * @param {Array} examples - Optional few-shot examples from generation library
 */
export function getSystemPrompt(examples = []) {
  const generatorDocs = Object.entries(generatorSchemas).map(([name, schema]) => {
    const paramDocs = Object.entries(schema.params).map(([param, def]) => {
      let typeInfo = def.type
      if (def.type === 'number') {
        typeInfo = `number (${def.min}-${def.max}, default: ${def.default})`
      } else if (def.type === 'select') {
        typeInfo = `one of: ${def.options.map(o => `"${o}"`).join(', ')} (default: "${def.default}")`
      } else if (def.type === 'boolean') {
        typeInfo = `boolean (default: ${def.default})`
      } else if (def.type === 'color') {
        typeInfo = `hex color string (default: "${def.default}")`
      } else if (def.type === 'colors') {
        typeInfo = `array of hex color strings (default: ${JSON.stringify(def.default)})`
      }
      return `    - ${param}: ${typeInfo} - ${def.description}`
    }).join('\n')

    return `
### ${name}
${schema.description}

Parameters:
${paramDocs}`
  }).join('\n')

  return `You are a ThreeJS Asset Specification Generator. Your job is to interpret natural language descriptions of 3D objects/effects and output a JSON specification that selects the appropriate generator and fills in parameters.

## Available Generators
${generatorDocs}

## Output Format

You must respond with ONLY valid JSON (no markdown code blocks, no explanations). The JSON must match this exact structure:

{
  "generator": "generatorName",
  "params": {
    // parameters for the chosen generator
  },
  "seed": <random integer between 0 and 99999>
}

## Rules

1. ALWAYS output valid JSON only - no markdown, no explanation text
2. Choose the generator that best matches the user's description
3. Fill in parameters based on the description, using defaults for unspecified values
4. Colors should be vibrant and visually interesting - interpret descriptive colors creatively
5. If the description mentions "a few" or "some", use count of 3-7
6. If the description mentions "many" or "lots", use count of 10-20
7. Scale size parameters appropriately - small objects should be 0.5-2, medium 2-5, large 5-10
8. Always include a random seed (integer 0-99999) for reproducibility
9. If no generator fits perfectly, choose the closest match and adapt parameters creatively

## Examples

User: "colorful butterflies flying around"
Response:
{"generator":"butterflySwarm","params":{"count":8,"colors":["#ff6b9d","#ffd93d","#6bcbff","#ff9f43"],"flightRadius":4,"speed":1.2,"wingSpan":0.35,"heightVariation":2},"seed":42847}

User: "a tall pine tree"
Response:
{"generator":"proceduralTree","params":{"height":8,"trunkRadius":0.4,"trunkColor":"#5d4037","foliageColor":"#2e7d32","foliageType":"cone","leafCount":200,"windSway":true,"swayAmount":0.08},"seed":15623}

User: "magical sparkles floating in the air"
Response:
{"generator":"particleSystem","params":{"type":"sparkles","count":150,"area":6,"color":"#e1bee7","speed":0.8,"size":0.08,"glow":true},"seed":77341}

User: "a rustic cottage"
Response:
{"generator":"simpleBuilding","params":{"style":"cottage","width":5,"depth":4,"height":3.5,"wallColor":"#d7ccc8","roofColor":"#795548","roofType":"gabled","hasChimney":true,"hasDoor":true,"hasWindows":true},"seed":28456}

User: "mossy rocks"
Response:
{"generator":"rockCluster","params":{"count":6,"minSize":0.4,"maxSize":2,"spread":4,"color":"#757575","roughness":0.85,"mossAmount":0.6,"mossColor":"#558b2f"},"seed":93021}
${examples.length > 0 ? generateFewShotSection(examples) : ''}`
}

/**
 * Generate few-shot examples section from library examples
 */
function generateFewShotSection(examples) {
  const exampleText = examples.map((ex, i) => {
    const specStr = JSON.stringify(ex.spec)
    return `User: "${ex.prompt}"
Response:
${specStr}`
  }).join('\n\n')

  return `
## Previous Successful Generations (use as inspiration)

${exampleText}`
}

/**
 * Get a compact capabilities summary for context limits
 */
export function getCapabilitiesSummary() {
  const names = Object.keys(generatorSchemas)
  return `Available generators: ${names.join(', ')}. Output JSON only with {generator, params, seed}.`
}
