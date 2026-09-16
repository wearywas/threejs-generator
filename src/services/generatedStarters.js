import { createAssetDocument } from './assetDocument'

/** Lightweight shipped examples; source documents are loaded only on selection. */
export const generatedStarters = [
  {
    id: 'park-apartments', name: 'Park Apartments',
    description: 'A generated apartment building, ready to explore and customize.',
    thumbnail: '/starters/park-apartments.png', path: '/starters/park-apartments.json',
  },
  {
    id: 'woodland-mushrooms', name: 'Woodland Mushrooms',
    description: 'A generated woodland mushroom scene with editable parameters.',
    thumbnail: '/starters/woodland-mushrooms.png', path: '/starters/woodland-mushrooms.json',
  },
  {
    id: 'alpine-cottage', name: 'Alpine Cottage',
    description: 'A generated alpine cottage to make your own.',
    thumbnail: '/starters/alpine-cottage.png', path: '/starters/alpine-cottage.json',
  },
]

/** Load and validate one shipped example without executing or saving it. */
export async function loadGeneratedStarter(id) {
  const starter = generatedStarters.find(entry => entry.id === id)
  if (!starter) throw new Error(`Unknown generated starter: ${id}`)
  try {
    const response = await fetch(starter.path)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return createAssetDocument(await response.json())
  } catch (error) {
    throw new Error(`Could not load ${starter.name} starter: ${error.message || 'Unknown error'}`, { cause: error })
  }
}
