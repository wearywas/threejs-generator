import React, { forwardRef } from 'react'
import LocalPreviewCanvas from './LocalPreviewCanvas'
import IsolatedPreviewCanvas from './IsolatedPreviewCanvas'

const PreviewCanvas = forwardRef(function PreviewCanvas({ asset, continuityKey }, ref) {
  if (asset?.isIsolated) return <IsolatedPreviewCanvas ref={ref} asset={asset} continuityKey={continuityKey} />
  if (asset?.isCodeGenerated) {
    return <div role="alert" className="p-4 text-sm text-red-300">Generated assets require the isolated runtime. Reload the source to try again.</div>
  }
  return <LocalPreviewCanvas ref={ref} asset={asset} />
})

export default PreviewCanvas
