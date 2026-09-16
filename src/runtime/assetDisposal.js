/** Fallback for returned assets that do not supply their own resource cleanup. */
export function disposeObject(root, sharedResources = []) {
  const disposed = new Set(sharedResources)
  const release = resource => {
    if (!resource || disposed.has(resource)) return
    disposed.add(resource)
    resource.dispose?.()
  }
  root?.traverse?.(child => {
    release(child.geometry)
    for (const material of [child.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) if (value?.isTexture) release(value)
      for (const uniform of Object.values(material.uniforms || {})) {
        for (const value of [uniform?.value].flat()) if (value?.isTexture) release(value)
      }
      release(material)
    }
  })
}

/** Honor custom ownership; do not double-dispose its resources afterward. */
export function createAssetDisposer(result, sharedResources = []) {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (typeof result.dispose === 'function') result.dispose()
    else disposeObject(result.root, sharedResources)
  }
}
