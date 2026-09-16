/** Capture the committed source/runtime pair, even if the workspace changes. */
export async function captureSaveSnapshot(current, preview) {
  const { document, asset } = current
  let release
  let thumbnail = null
  try {
    release = asset.retain?.()
    thumbnail = asset.isIsolated
      ? await asset.captureThumbnail(256, 256)
      : await preview?.captureThumbnail(256, 256, asset)
  } catch {
    // A broken preview must not prevent recovery of the editable source.
  } finally {
    release?.()
  }
  return { document, thumbnail: typeof thumbnail === 'string' ? thumbnail : null }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}

/** Keep the original asset alive until its GLB has been exported/downloaded. */
export async function exportAssetGLB(asset, filename, { exportLocal, download = downloadBlob } = {}) {
  const release = asset.retain?.()
  try {
    if (asset.isIsolated) {
      const bytes = await asset.exportGLB()
      await download(new Blob([bytes], { type: 'model/gltf-binary' }), `${filename}.glb`)
    } else {
      await exportLocal(asset.root, filename)
    }
  } finally {
    release?.()
  }
}
