import * as THREE from 'three'

const objectHooks = ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']
const materialHooks = ['onBeforeRender', 'onBeforeCompile', 'customProgramCacheKey']
// Snapshot before asset factories run; generated code can override shared prototypes too.
const defaultObjectHooks = Object.fromEntries(objectHooks.map(hook => [hook, THREE.Object3D.prototype[hook]]))
const defaultMaterialHooks = Object.fromEntries(materialHooks.map(hook => [hook, THREE.Material.prototype[hook]]))
const staticMaterials = new Set([
  THREE.MeshBasicMaterial, THREE.MeshLambertMaterial, THREE.MeshPhongMaterial,
  THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial, THREE.MeshToonMaterial,
  THREE.MeshNormalMaterial, THREE.MeshDepthMaterial, THREE.MeshDistanceMaterial,
  THREE.MeshMatcapMaterial, THREE.LineBasicMaterial, THREE.LineDashedMaterial,
  THREE.PointsMaterial, THREE.SpriteMaterial, THREE.ShadowMaterial,
])
const staticTextures = new Set([
  THREE.Texture, THREE.CubeTexture, THREE.DataTexture, THREE.Data3DTexture,
  THREE.DataArrayTexture, THREE.CompressedTexture, THREE.CompressedArrayTexture,
])

function isReadyImage(image) {
  if (!image || typeof image !== 'object') return false
  const tag = String(image.nodeName || image.tagName || '').toUpperCase()
  if (tag === 'VIDEO' || tag === 'CANVAS' || typeof image.getContext === 'function' ||
      typeof image.requestVideoFrameCallback === 'function') return false
  if ('complete' in image && image.complete !== true) return false
  const width = image.naturalWidth ?? image.width
  const height = image.naturalHeight ?? image.height
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
}

function isStaticTexture(texture) {
  if (!staticTextures.has(texture.constructor) || texture.isVideoTexture ||
      texture.isCanvasTexture || texture.isRenderTargetTexture || texture.isFramebufferTexture ||
      texture.isDynamicTexture || texture.userData?.dynamic || texture.onUpdate) return false
  const image = texture.source?.data
  if (texture.isCubeTexture) {
    return Array.isArray(image) && image.length === 6 && image.every(isReadyImage)
  }
  return isReadyImage(image)
}

function isStaticMaterial(material) {
  if (!material?.isMaterial || !staticMaterials.has(material.constructor)) return false
  if (materialHooks.some(hook => material[hook] !== defaultMaterialHooks[hook])) return false
  return Object.values(material).every(value => !value?.isTexture || isStaticTexture(value))
}

/**
 * Whether an asset is explicitly known to need only invalidated renders.
 * `hasAnimation: false` is the factory's declaration (its no-op tick wrappers
 * are allowed), not proof by itself. Unknown assets, hooks, dynamic resources,
 * and incomplete texture loads keep continuous rendering and shadow updates.
 * Call again after replacing/mutating an asset; this does not subscribe to it.
 * @param {Object} asset - A local asset instance with its actual Three root.
 * @returns {boolean}
 */
export function canRenderOnDemand(asset) {
  if (asset?.hasAnimation !== false || !asset.root?.isObject3D ||
      typeof asset.root.traverse !== 'function') return false

  let eligible = true
  asset.root.traverse(object => {
    if (!eligible) return
    if (objectHooks.some(hook => object[hook] !== defaultObjectHooks[hook]) ||
        object.customDepthMaterial || object.customDistanceMaterial ||
        object.isSkinnedMesh || object.isLOD || object.morphTexture || object.animations?.length ||
        object.morphTargetInfluences?.some(value => value !== 0)) {
      eligible = false
      return
    }
    const attributes = Object.values(object.geometry?.attributes || {})
    if (object.geometry?.index) attributes.push(object.geometry.index)
    if (object.instanceMatrix) attributes.push(object.instanceMatrix)
    if (object.instanceColor) attributes.push(object.instanceColor)
    if (attributes.some(attribute => (attribute.isInterleavedBufferAttribute ? attribute.data : attribute).usage !== THREE.StaticDrawUsage)) {
      eligible = false
      return
    }
    if (object.material && ![object.material].flat().every(isStaticMaterial)) eligible = false
    for (const texture of [object.background, object.environment]) {
      if (texture?.isTexture && !isStaticTexture(texture)) eligible = false
    }
  })
  return eligible
}
