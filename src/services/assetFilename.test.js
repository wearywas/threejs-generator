import { describe, expect, it } from 'vitest'
import { assetFilenameStem } from './assetFilename'

describe('assetFilenameStem', () => {
  it.each([
    ['A Red Wooden Chair', 'a-red-wooden-chair'],
    ['  A\tred\nchair!!! / with\\wheels: <large>|?*  ', 'a-red-chair-with-wheels-large'],
    ['one two three four five six seven eight nine ten', 'one-two-three-four-five-six-seven-eight'],
    ['A beautiful ancient mountain village surrounded by waterfalls', 'a-beautiful-ancient-mountain-village-surrounded-by'],
    ['A beautiful ancient mountain village surrounded by waterfall beyond', 'a-beautiful-ancient-mountain-village-surrounded-by-waterfall'],
    ['extraordinary extraordinary extraordinary extraordinary village', 'extraordinary-extraordinary-extraordinary-extraordinary'],
    ['Café 城堡 Árbol', 'café-城堡-árbol'],
    ['Cafe\u0301', 'café'],
    ['🌲 Forest\u202E castle 🏰', 'forest-castle'],
    ['../../castle. ', 'castle'],
    ['con.txt', 'con-txt'],
  ])('normalizes %j into %j', (prompt, expected) => {
    expect(assetFilenameStem(prompt)).toBe(expected)
  })

  it('caps an unbroken word at 60 characters', () => {
    expect(assetFilenameStem('a'.repeat(80))).toBe('a'.repeat(60))
  })

  it.each(['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'COM¹', 'LPT²'])('makes Windows device name %s safe', (prompt) => {
    expect(assetFilenameStem(prompt)).toBe(`asset-${prompt.normalize('NFKC').toLowerCase()}`)
  })

  it.each([undefined, null, '', '   ', '!!!', '🌲', 42, {}])('uses a sanitized generator fallback for %j', (prompt) => {
    expect(assetFilenameStem(prompt, 'Rock / Cluster')).toBe('rock-cluster')
  })

  it.each([undefined, null, '', '...', {}, 123])('uses asset when both candidates are unusable (%j)', (fallback) => {
    expect(assetFilenameStem('?!', fallback)).toBe('asset')
  })

  it('prefers a usable prompt over the generator', () => {
    expect(assetFilenameStem('Blue chair', 'rock')).toBe('blue-chair')
  })

  it('sanitizes reserved fallback names too', () => {
    expect(assetFilenameStem('', 'NUL')).toBe('asset-nul')
  })

  it('does not add a counter or timestamp on repeated exports', () => {
    expect([assetFilenameStem('Blue chair'), assetFilenameStem('Blue chair')]).toEqual(['blue-chair', 'blue-chair'])
  })
})
