// Unit-test adapter at the browser boundary. Real worker factory and analysis
// behavior stays exercised in Node; browser smokes test actual isolation.
import { executeFactory } from '../runtime/isolated/factory.js'
import { evaluateCreativeAsset } from '../runtime/creativeCritic.js'
import { generateInstanceSpec } from '../runtime/InstanceSpecAnalysis.js'

export async function executeIsolated(code, options = {}) {
  const asset = await executeFactory(code, options)
  asset.criticEvaluation = evaluateCreativeAsset({ asset, code, prompt: options.prompt, assetFamily: options.assetFamily })
  asset.analyze = analysisOptions => generateInstanceSpec(code, { ...options, ...analysisOptions }, asset)
  return asset
}
