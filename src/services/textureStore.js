/**
 * Texture Storage Service
 * Stores uploaded textures in IndexedDB for use with generators
 */

const DB_NAME = 'threejs-generator-textures'
const DB_VERSION = 1
const STORE_NAME = 'textures'

let db = null

/**
 * Initialize the IndexedDB database
 */
async function initDB() {
  if (db) return db
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      reject(new Error('Failed to open texture database'))
    }
    
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('generator', 'generator', { unique: false })
        store.createIndex('slot', 'slot', { unique: false })
      }
    }
  })
}

/**
 * Generate a key for a texture
 */
function getKey(generator, slot) {
  return `${generator}:${slot}`
}

/**
 * Save a texture to storage
 * @param {string} generator - Generator name
 * @param {string} slot - Slot ID
 * @param {File} file - The image file
 * @returns {Promise<void>}
 */
export async function saveTexture(generator, slot, file) {
  const database = await initDB()
  
  // Convert file to base64 data URL
  const dataUrl = await fileToDataUrl(file)
  
  const record = {
    id: getKey(generator, slot),
    generator,
    slot,
    dataUrl,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    uploadedAt: Date.now()
  }
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(record)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to save texture'))
  })
}

/**
 * Get a single texture from storage
 * @param {string} generator - Generator name
 * @param {string} slot - Slot ID
 * @returns {Promise<Object|null>}
 */
export async function getTexture(generator, slot) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(getKey(generator, slot))
    
    request.onsuccess = () => {
      resolve(request.result || null)
    }
    request.onerror = () => reject(new Error('Failed to get texture'))
  })
}

/**
 * Get all textures for a generator
 * @param {string} generator - Generator name
 * @returns {Promise<Object>} - Object keyed by slot ID with data URLs
 */
export async function getTextures(generator) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('generator')
    const request = index.getAll(generator)
    
    request.onsuccess = () => {
      const results = request.result || []
      const textures = {}
      
      for (const record of results) {
        textures[record.slot] = record.dataUrl
      }
      
      resolve(textures)
    }
    request.onerror = () => reject(new Error('Failed to get textures'))
  })
}

/**
 * Delete a texture from storage
 * @param {string} generator - Generator name
 * @param {string} slot - Slot ID
 * @returns {Promise<void>}
 */
export async function clearTexture(generator, slot) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(getKey(generator, slot))
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to delete texture'))
  })
}

/**
 * Delete all textures for a generator
 * @param {string} generator - Generator name
 * @returns {Promise<void>}
 */
export async function clearAllTextures(generator) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('generator')
    const request = index.openCursor(generator)
    
    request.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    request.onerror = () => reject(new Error('Failed to clear textures'))
  })
}

/**
 * Get info about all stored textures
 * @returns {Promise<Array>}
 */
export async function getAllTextureInfo() {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()
    
    request.onsuccess = () => {
      const results = request.result || []
      // Return info without the data URL (which can be large)
      resolve(results.map(r => ({
        id: r.id,
        generator: r.generator,
        slot: r.slot,
        filename: r.filename,
        mimeType: r.mimeType,
        size: r.size,
        uploadedAt: r.uploadedAt
      })))
    }
    request.onerror = () => reject(new Error('Failed to get texture info'))
  })
}

/**
 * Convert a File to a data URL
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// ============================================================
// Creative Mode Texture Functions
// These are for dynamic texture slots defined by LLM-generated code
// ============================================================

const CREATIVE_PREFIX = '_creative:'

/**
 * Save a texture for creative mode (dynamic slots)
 * @param {string} slotId - Slot ID
 * @param {string} dataUrl - Already converted data URL
 * @param {string} filename - Original filename
 * @returns {Promise<void>}
 */
export async function saveCreativeTexture(slotId, dataUrl, filename) {
  const database = await initDB()
  
  const record = {
    id: CREATIVE_PREFIX + slotId,
    generator: '_creative',
    slot: slotId,
    dataUrl,
    filename,
    mimeType: 'image/png',
    size: dataUrl.length,
    uploadedAt: Date.now()
  }
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(record)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to save creative texture'))
  })
}

/**
 * Get a single creative mode texture
 * @param {string} slotId - Slot ID
 * @returns {Promise<Object|null>}
 */
export async function getCreativeTexture(slotId) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(CREATIVE_PREFIX + slotId)
    
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error('Failed to get creative texture'))
  })
}

/**
 * Get all creative mode textures as an object keyed by slot ID
 * @returns {Promise<Object>}
 */
export async function getCreativeTextures() {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('generator')
    const request = index.getAll('_creative')
    
    request.onsuccess = () => {
      const results = request.result || []
      const textures = {}
      
      for (const record of results) {
        textures[record.slot] = record.dataUrl
      }
      
      resolve(textures)
    }
    request.onerror = () => reject(new Error('Failed to get creative textures'))
  })
}

/**
 * Clear a single creative mode texture
 * @param {string} slotId - Slot ID
 * @returns {Promise<void>}
 */
export async function clearCreativeTexture(slotId) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(CREATIVE_PREFIX + slotId)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to clear creative texture'))
  })
}

/**
 * Clear all creative mode textures
 * @returns {Promise<void>}
 */
export async function clearAllCreativeTextures() {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('generator')
    const request = index.openCursor('_creative')
    
    request.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    request.onerror = () => reject(new Error('Failed to clear creative textures'))
  })
}

/**
 * Create a thumbnail from a data URL
 * @param {string} dataUrl 
 * @param {number} maxSize 
 * @returns {Promise<string>}
 */
export async function createThumbnail(dataUrl, maxSize = 64) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height
      
      if (width > height) {
        if (width > maxSize) {
          height = height * (maxSize / width)
          width = maxSize
        }
      } else {
        if (height > maxSize) {
          width = width * (maxSize / height)
          height = maxSize
        }
      }
      
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
