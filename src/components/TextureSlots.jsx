import React from 'react'
import { getTextureSlots } from '../schemas/assetSpec'
import AssetTextureSlots from './AssetTextureSlots'

export default function TextureSlots({ generator, ...props }) {
  return <AssetTextureSlots slots={generator ? getTextureSlots(generator) : []} maxMB={2} {...props} />
}
