/**
 * Generation Library Service
 * Stores successful generations in IndexedDB for reference and few-shot learning
 */

import { classifyAssetFamily, getAssetFamilyBucket } from './assetFamily'

const DB_NAME = 'threejs-generator-library'
const DB_VERSION = 2
const STORE_NAME = 'generations'

// Keep few-shot context conservative and preserve complete source snippets.
export const MAX_EXAMPLE_SOURCE_CHARS = 12000
export const MAX_TOTAL_EXAMPLE_SOURCE_CHARS = 24000

let db = null

/**
 * Initialize the IndexedDB database
 */
async function initDB() {
  if (db) return db
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      reject(new Error('Failed to open generation library database'))
    }
    
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('mode', 'mode', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('starred', 'starred', { unique: false })
        store.createIndex('family', 'family', { unique: false })
      } else {
        const transaction = event.target.transaction
        const store = transaction.objectStore(STORE_NAME)
        if (!store.indexNames.contains('family')) {
          store.createIndex('family', 'family', { unique: false })
        }
      }
    }
  })
}

/**
 * Run a mutation, reporting success only once every request has committed.
 */
function writeTransaction(database, message, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    let result
    let failure
    const abort = error => {
      failure = error
      transaction.abort()
    }

    transaction.oncomplete = () => resolve(result)
    transaction.onerror = event => {
      failure ||= transaction.error || event.target.error || new Error(message)
      reject(failure)
    }
    transaction.onabort = () => reject(failure || transaction.error || new Error(message))

    try {
      result = operation(transaction.objectStore(STORE_NAME), abort)
    } catch (error) {
      abort(error)
    }
  })
}

/**
 * Generate a unique ID
 */
function generateId() {
  return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Extract keywords/tags from a prompt
 */
function extractTags(prompt) {
  // Common words to ignore
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'with', 'of', 'in', 'on', 'at',
    'to', 'for', 'is', 'are', 'was', 'were', 'some', 'few', 'many', 'make',
    'create', 'generate', 'me', 'please', 'i', 'want', 'would', 'like'
  ])
  
  // Extract words and filter
  const words = prompt.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
  
  // Get unique words
  return [...new Set(words)].slice(0, 10)
}

/**
 * Save a generation to the library
 * @param {Object} data - Generation data
 * @returns {Promise<string>} - The saved generation ID
 */
export async function saveGeneration(data) {
  // Capture caller-owned document state before opening the database yields.
  data = structuredClone(data)
  const database = await initDB()
  
  // Combine auto-extracted tags with any custom tags
  const autoTags = extractTags(data.prompt)
  const customTags = data.customTags || []
  const allTags = [...new Set([...customTags, ...autoTags])].slice(0, 15)
  
  const record = {
    id: generateId(),
    createdAt: Date.now(),
    name: data.name || data.prompt, // Custom name or fall back to prompt
    prompt: data.prompt,
    mode: data.mode, // 'curated' | 'creative' | 'procedural'
    spec: data.spec || null,
    code: data.code || null,
    schema: data.schema || null, // Procedural parameter schema
    textureSlots: data.textureSlots || null, // Dynamic texture slots from Generative Edit
    thumbnail: data.thumbnail || null,
    starred: false,
    family: data.family || classifyAssetFamily(data.prompt),
    tags: allTags
  }

  // Older callers may not have document state; never invent a historical seed.
  for (const field of ['documentVersion', 'seed', 'params', 'textures', 'restorationNotes']) {
    if (Object.hasOwn(data, field)) record[field] = data[field]
  }
  
  return writeTransaction(database, 'Failed to save generation', store => {
    store.add(record)
    return record.id
  })
}

/**
 * Get a generation by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getGeneration(id) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)
    
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error('Failed to get generation'))
  })
}

/**
 * Get all generations
 * @param {Object} options - Filter options
 * @returns {Promise<Array>}
 */
export async function getAllGenerations(options = {}) {
  const database = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()
    
    request.onsuccess = () => {
      let results = request.result || []
      
      // Apply filters
      if (options.mode) {
        results = results.filter(r => r.mode === options.mode)
      }
      if (options.starred !== undefined) {
        results = results.filter(r => r.starred === options.starred)
      }
      if (options.tags && options.tags.length > 0) {
        results = results.filter(r => 
          options.tags.some(tag => r.tags.includes(tag.toLowerCase()))
        )
      }
      
      // Sort by creation date (newest first)
      results.sort((a, b) => b.createdAt - a.createdAt)
      
      // Apply limit
      if (options.limit) {
        results = results.slice(0, options.limit)
      }
      
      resolve(results)
    }
    request.onerror = () => reject(new Error('Failed to get generations'))
  })
}

/**
 * Update a generation (e.g., toggle starred)
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateGeneration(id, updates) {
  const database = await initDB()
  
  return writeTransaction(database, 'Failed to update generation', (store, abort) => {
    // Read and write in the same transaction so concurrent updates cannot race.
    const request = store.get(id)
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('Generation not found')
        store.put({ ...request.result, ...updates })
      } catch (error) {
        abort(error)
      }
    }
  })
}

/**
 * Delete a generation
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteGeneration(id) {
  const database = await initDB()
  
  return writeTransaction(database, 'Failed to delete generation', store => {
    store.delete(id)
  })
}

/**
 * Get relevant examples for few-shot learning
 * @param {string} prompt - Current prompt
 * @param {string} mode - Generation mode ('curated' | 'creative')
 * @param {number} limit - Maximum examples to return
 * @returns {Promise<Array>}
 */
export function rankRelevantExamples(generations, prompt, options = {}) {
  const limit = typeof options === 'number' ? options : (options.limit ?? 3)
  const assetFamily =
    typeof options === 'number'
      ? classifyAssetFamily(prompt)
      : (options.assetFamily || classifyAssetFamily(prompt))
  const targetBucket = getAssetFamilyBucket(assetFamily)
  const promptTags = extractTags(prompt)

  const scored = generations.map(gen => {
    const exampleFamily = gen.family || classifyAssetFamily(gen.prompt || '')
    const exampleBucket = getAssetFamilyBucket(exampleFamily)
    const exampleTags = new Set([
      ...extractTags(gen.prompt || ''),
      ...(Array.isArray(gen.tags) ? gen.tags.filter(tag => typeof tag === 'string').map(tag => tag.toLowerCase()) : [])
    ])
    const overlapCount = promptTags.filter(tag => exampleTags.has(tag)).length

    let familyScore = 0
    if (assetFamily !== 'general') {
      if (exampleFamily === assetFamily) {
        familyScore = 100
      } else if (exampleBucket === targetBucket && exampleBucket !== 'general') {
        familyScore = 50
      }
    }

    return {
      ...gen,
      family: exampleFamily,
      score: familyScore + overlapCount
    }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (Boolean(a.starred) !== Boolean(b.starred)) return Number(Boolean(b.starred)) - Number(Boolean(a.starred))
    return b.createdAt - a.createdAt
  })

  return scored.slice(0, limit)
}

export async function getRelevantExamples(prompt, mode = 'curated', options = {}) {
  const limit = typeof options === 'number' ? options : (options.limit ?? 3)
  if (limit <= 0) return []
  const allGenerations = await getAllGenerations(mode === 'creative' ? {} : { mode })
  const candidates = mode === 'creative'
    ? allGenerations.filter(gen => gen.mode === 'creative' || gen.mode === 'procedural')
    : allGenerations
  // Rank the entire pool: oversized entries must not crowd out smaller matches.
  const ranked = rankRelevantExamples(candidates, prompt, {
    ...(typeof options === 'number' ? {} : options), limit: candidates.length
  })
  const relevant = []
  let totalSourceChars = 0
  for (const example of ranked) {
    if (example.score <= 0) continue
    if (mode !== 'curated') {
      // This is a source-shape check, not a claim of saved code quality.
      if (typeof example.code !== 'string' || !example.code.trim()) continue
      const sourceChars = example.code.length
      if (sourceChars > MAX_EXAMPLE_SOURCE_CHARS || totalSourceChars + sourceChars > MAX_TOTAL_EXAMPLE_SOURCE_CHARS) continue
      totalSourceChars += sourceChars
    }
    relevant.push(example)
    if (relevant.length >= limit) break
  }
  return relevant
}

/**
 * Export the entire library as JSON
 * @returns {Promise<Object>}
 */
export async function exportLibrary() {
  const generations = await getAllGenerations()
  
  return {
    version: 2,
    exportedAt: Date.now(),
    count: generations.length,
    generations
  }
}

/**
 * Import generations from a JSON export
 * @param {Object} data - Exported library data
 * @param {Object} options - Import options
 * @returns {Promise<{imported: number, skipped: number}>}
 */
export async function importLibrary(data, options = { skipDuplicates: true }) {
  if (!data || !Array.isArray(data.generations)) {
    throw new Error('Invalid library export format')
  }
  if (data.version !== undefined && data.version !== 1 && data.version !== 2) {
    throw new Error('Unsupported library export version')
  }
  
  const database = await initDB()
  return writeTransaction(database, 'Failed to import library', (store, abort) => {
    const counts = { imported: 0, skipped: 0 }
    const request = store.getAllKeys()
    request.onsuccess = () => {
      try {
        // Check and reserve IDs inside the write transaction, including this batch.
        const existingIds = new Set(request.result)
        for (const gen of data.generations) {
          if (options.skipDuplicates && existingIds.has(gen.id)) {
            counts.skipped++
            continue
          }

          let id = gen.id
          if (existingIds.has(id)) {
            do { id = generateId() } while (existingIds.has(id))
          }
          store.add({ ...gen, id, importedAt: Date.now() })
          existingIds.add(id)
          counts.imported++
        }
      } catch (error) {
        abort(error)
      }
    }
    return counts
  })
}

/**
 * Clear the entire library
 * @returns {Promise<void>}
 */
export async function clearLibrary() {
  const database = await initDB()
  
  return writeTransaction(database, 'Failed to clear library', store => {
    store.clear()
  })
}

/**
 * Get library statistics
 * @returns {Promise<Object>}
 */
export async function getLibraryStats() {
  const all = await getAllGenerations()
  
  const stats = {
    total: all.length,
    curated: all.filter(g => g.mode === 'curated').length,
    creative: all.filter(g => g.mode === 'creative').length,
    procedural: all.filter(g => g.mode === 'procedural').length,
    starred: all.filter(g => g.starred).length,
    oldestDate: all.length > 0 ? Math.min(...all.map(g => g.createdAt)) : null,
    newestDate: all.length > 0 ? Math.max(...all.map(g => g.createdAt)) : null
  }
  
  // Get tag frequency
  const tagCounts = {}
  for (const gen of all) {
    for (const tag of gen.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
  }
  stats.topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))
  
  return stats
}
