import * as generationService from '../api/generationService'
import { createAsset } from './AssetFactory'
import { executeCode, normalizeCreativeCode } from './CodeSandbox'
import { createAssetDocument, restoreAssetDocument, createSeed } from '../services/assetDocument'
import { getRelevantExamples } from '../services/generationLibrary'
import { getTextures, getCreativeTextures } from '../services/textureStore'
import { parseAssetSource } from '../services/assetSource'
import { classifyAssetFamily } from '../services/assetFamily'

/** All operations build a complete candidate before the workspace commits it. */
export function createAssetActions(workspace, {
  services = generationService,
  getExamples = getRelevantExamples,
  getDefaultTextures = (generator) => generator ? getTextures(generator) : getCreativeTextures(),
  nextSeed = createSeed,
  getExecutionOptions = () => ({}),
} = {}) {
  const optionsFor = (doc, signal) => ({ ...getExecutionOptions(), seed: doc.seed, params: doc.params, textures: doc.textures, prompt: doc.prompt, assetFamily: doc.family, signal })
  const build = async (document, signal) => ({
    document,
    asset: document.mode === 'curated'
      ? createAsset({ ...document.spec, textures: document.textures })
      : await executeCode(document.code, optionsFor(document, signal)),
  })
  const requireCurrent = current => {
    if (!current) throw new Error('Create or load an asset first')
    return current.document
  }
  const checkCurrent = isCurrent => {
    if (!isCurrent()) throw new DOMException('Operation cancelled', 'AbortError')
  }
  const modelUpdate = (kind, request) => workspace.run(kind, async (current, _, signal) => {
    const doc = requireCurrent(current)
    if (!doc.code) throw new Error('This operation requires a code-generated asset')
    const result = await request(doc, optionsFor(doc, signal))
    try {
      const schema = result.schema ?? doc.schema
      const document = createAssetDocument({
        ...doc, code: result.code, schema, params: result.params ?? doc.params,
        textureSlots: result.textureSlots ?? doc.textureSlots,
        mode: schema && Object.keys(schema).length ? 'procedural' : 'creative',
      })
      return { document, asset: result.asset }
    } catch (error) {
      result.asset?.dispose()
      throw error
    }
  })

  return {
    generate(prompt) {
      const seed = nextSeed()
      const assetFamily = classifyAssetFamily(prompt)
      return workspace.run('generate', async (_, isCurrent, signal) => {
        const examples = await getExamples(prompt, 'creative', { limit: 3, assetFamily })
        checkCurrent(isCurrent)
        const textures = await getDefaultTextures()
        checkCurrent(isCurrent)
        const result = await services.generateCreativeAsset(prompt, examples, 3, { ...getExecutionOptions(), seed, textures, params: {}, assetFamily, signal }, { assetFamily })
        try {
          return { asset: result.asset, document: createAssetDocument({ mode: 'creative', prompt, family: assetFamily, code: result.code, seed, textures }) }
        } catch (error) { result.asset?.dispose(); throw error }
      })
    },
    load(record) {
      return workspace.run('load', (_, __, signal) => build(restoreAssetDocument(record), signal))
    },
    importCode(text, filename = '') {
      const code = normalizeCreativeCode(text)
      if (!code) return Promise.resolve(false)
      const prompt = filename.replace(/\.[^.]*$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported asset'
      return workspace.run('import', (_, __, signal) => build(parseAssetSource(text) || createAssetDocument({
        mode: 'creative', prompt, code, seed: nextSeed(),
        restorationNotes: ['Imported source has no saved seed, parameters, or texture inputs. A new seed is being used.'],
      }), signal))
    },
    rerun(code) {
      return workspace.run('rerun', (current, _, signal) => build(createAssetDocument({ ...requireCurrent(current), code }), signal))
    },
    changeParams(params) {
      return workspace.scheduleParameters(params, (current, intendedParams, signal) => {
        const doc = requireCurrent(current)
        return build(createAssetDocument({ ...doc, params: intendedParams }), signal)
      })
    },
    changeSeed(seed) {
      return workspace.run('seed', (current, _, signal) => build(createAssetDocument({ ...requireCurrent(current), seed }), signal))
    },
    changeTexture(slot, dataUrl, expectedCurrent) {
      return workspace.run('texture', (current, _, signal) => {
        const doc = requireCurrent(current)
        const textures = { ...doc.textures }
        if (dataUrl) textures[slot] = dataUrl
        else delete textures[slot]
        return build(createAssetDocument({ ...doc, textures }), signal)
      }, expectedCurrent)
    },
    convert: (guidance = '') => modelUpdate('convert', (doc, options) => services.convertToProceduralAsset(doc.code, doc.prompt, 3, options, { guidance })),
    animate: () => modelUpdate('animate', (doc, options) => services.addAnimationToAsset(doc.code, doc.prompt, doc.schema, 3, options)),
    edit: request => modelUpdate('edit', (doc, options) => services.editAsset(doc.code, doc.prompt, request, doc.schema, doc.textureSlots, 3, options)),
  }
}
