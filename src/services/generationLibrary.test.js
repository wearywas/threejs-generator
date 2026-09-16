import { describe, expect, it } from 'vitest'

import { rankRelevantExamples } from './generationLibrary'

describe('rankRelevantExamples', () => {
  it('prefers examples from the same asset family before generic tag overlap', () => {
    const prompt = 'cozy coastal cottage with blue shutters'
    const examples = [
      {
        id: 'generic-building',
        prompt: 'stone building',
        createdAt: 1,
        tags: ['cozy', 'coastal', 'cottage', 'blue', 'shutters'],
        family: 'general'
      },
      {
        id: 'tower',
        prompt: 'watchtower',
        createdAt: 2,
        tags: ['coastal'],
        family: 'tower'
      },
      {
        id: 'cottage',
        prompt: 'coastal cottage',
        createdAt: 3,
        tags: ['coastal', 'cottage', 'shutters'],
        family: 'smallBuilding'
      }
    ]

    const ranked = rankRelevantExamples(examples, prompt, { assetFamily: 'smallBuilding', limit: 3 })

    expect(ranked.map(example => example.id)).toEqual(['cottage', 'tower', 'generic-building'])
  })
})
