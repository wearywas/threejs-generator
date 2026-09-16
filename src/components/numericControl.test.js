import { describe, expect, it } from 'vitest'
import { getNumericControl, numericControlKey, numericControlValue } from './numericControl'

describe('numeric parameter editing', () => {
  const scale = getNumericControl({ type: 'number', min: 0.1, max: 3 })
  const count = getNumericControl({ type: 'integer', min: 1, max: 14 })

  it('uses useful decimal increments, not one hundred arbitrary divisions of the range', () => {
    expect(scale.step).toBe(0.01)
    expect(numericControlKey(1, 'ArrowRight', scale)).toBe(1.01)
    expect(numericControlKey(1.01, 'ArrowLeft', scale)).toBe(1)
    expect(numericControlValue('1.004', scale, true)).toBe(1)
  })

  it('preserves precise typed values and off-grid saved values during keyboard edits', () => {
    expect(numericControlValue('1.23456', scale)).toBe(1.23456)
    expect(numericControlKey(1.23456, 'ArrowRight', scale)).toBe(1.24456)
  })

  it('rounds count edits and clamps edits to the supported range', () => {
    expect(numericControlKey(7, 'ArrowRight', count)).toBe(8)
    expect(numericControlValue('7.6', count)).toBe(8)
    expect(numericControlValue('-10', count)).toBe(1)
    expect(numericControlValue('100', count)).toBe(14)
    expect(numericControlKey(14, 'ArrowRight', count)).toBe(14)
  })

  it('honors declared steps and uses the minimum as the pointer-step origin', () => {
    const declared = getNumericControl({ type: 'number', min: 0.1, max: 3, step: 0.25 })
    expect(numericControlKey(0.1, 'ArrowRight', declared)).toBe(0.35)
    expect(numericControlValue('0.4', declared, true)).toBe(0.35)
    expect(numericControlValue('0.4', declared)).toBe(0.4)
  })

  it('supports page and boundary keys but ignores unrelated keys', () => {
    expect(numericControlKey(1, 'PageUp', scale)).toBe(1.1)
    expect(numericControlKey(1, 'PageDown', scale)).toBe(0.9)
    expect(numericControlKey(1, 'Home', scale)).toBe(0.1)
    expect(numericControlKey(1, 'End', scale)).toBe(3)
    expect(numericControlKey(1, 'Tab', scale)).toBeNull()
  })

  it.each(['', ' ', 'NaN', 'Infinity', '1.2oops'])('ignores invalid numeric entry %j', raw => {
    expect(numericControlValue(raw, scale)).toBeNull()
  })

  it('recognizes older count descriptions without making all numeric fields integers', () => {
    expect(getNumericControl({ type: 'number', min: 0, max: 8, description: 'Rounded number of leafy lobes.' }, 'density').integer).toBe(true)
    expect(getNumericControl({ type: 'number', min: 1, max: 14 }, 'branchCount').step).toBe(1)
    expect(getNumericControl({ type: 'number', min: 1, max: 14, step: 0.5 }, 'branchCount').integer).toBe(false)
    expect(scale.integer).toBe(false)
  })

  it.each([
    ['segmentLength', { label: 'Segment Length' }],
    ['radius', { description: 'Radius rounded to two decimal places.' }],
  ])('keeps continuous %s values editable below one', (name, hints) => {
    const control = getNumericControl({ type: 'number', min: 0.1, max: 3, ...hints }, name)
    expect(control.integer).toBe(false)
    expect(numericControlValue('0.75', control)).toBe(0.75)
  })

  it('still recognizes a segments count with an unrelated display label', () => {
    expect(getNumericControl({ type: 'number', min: 8, max: 64, label: 'Detail Level' }, 'segments').step).toBe(1)
  })
})
