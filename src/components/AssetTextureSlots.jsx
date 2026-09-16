import React, { useEffect, useRef, useState } from 'react'

/** Document-owned texture inputs. Uploads never mutate the shared texture store. */
export default function AssetTextureSlots({ slots = [], textures = {}, onTextureChange, maxMB = 5 }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const readerRef = useRef(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; readerRef.current?.abort() }
  }, [])

  const upload = async (slot, file) => {
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > maxMB * 1024 * 1024) { setError(`File size must be under ${maxMB}MB.`); return }
    setUploading(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        readerRef.current = reader
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the image file.'))
        reader.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
        reader.readAsDataURL(file)
      })
      if (mounted.current) await onTextureChange(slot, dataUrl)
    } catch (error) {
      if (mounted.current && error.name !== 'AbortError') setError(error.message)
    } finally {
      if (mounted.current) setUploading(false)
    }
  }

  if (!slots.length) return <p className="text-xs text-gray-500">No texture slots available</p>
  return (
    <div className="space-y-2">
      {slots.map(slot => (
        <div key={slot.id} className="flex items-center gap-2">
          {textures[slot.id] && <img src={textures[slot.id]} alt={`${slot.label} texture`} className="w-10 h-10 rounded object-cover" />}
          <label className="flex-1 min-w-0 text-xs text-gray-300" title={slot.description}>
            {slot.label || slot.id}
            <input aria-label={`${slot.label || slot.id} texture`} type="file" accept={slot.accept || 'image/*'} disabled={uploading}
              className="block w-full text-xs text-gray-400 mt-1"
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; upload(slot.id, file) }} />
          </label>
          {textures[slot.id] && <button type="button" disabled={uploading} title="Remove texture" aria-label={`Remove ${slot.label || slot.id} texture`}
            className="text-xs text-gray-400 hover:text-red-300" onClick={() => onTextureChange(slot.id, null)}>Remove</button>}
        </div>
      ))}
      {uploading && <p className="text-xs text-gray-400" role="status">Applying texture...</p>}
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>
  )
}
