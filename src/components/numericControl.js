/** Numeric UI hints, including conservative count hints in older generated schemas. */
export function getNumericControl(definition, name = '') {
  const hints = [name, definition.label || ''].map(hint => hint.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
  const integer = definition.type === 'integer' || (definition.step === undefined && (
    hints.some(hint => /\b(count|segments)\s*$/.test(hint)) || /\b(whole[ -]number|rounded number|integer)\b/i.test(definition.description || '')
  ))
  let min = Number.isFinite(definition.min) ? definition.min : 0
  let max = Number.isFinite(definition.max) ? definition.max : Math.max(10, min)
  if (integer) { min = Math.ceil(min); max = Math.floor(max) }
  max = Math.max(min, max)
  const declaredStep = Number.isFinite(definition.step) && definition.step > 0 ? definition.step : null
  const step = integer ? Math.max(1, Math.round(declaredStep || 1))
    : declaredStep || 10 ** Math.floor(Math.log10((max - min) / 100 || 0.01))
  return { min, max, step, integer }
}

/** Exact entry is preserved; pointer movement snaps to the declared/nice increment. */
export function numericControlValue(raw, control, snap = false) {
  if (typeof raw === 'string' && !raw.trim()) return null
  let value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (snap) value = Number((control.min + Math.round((value - control.min) / control.step) * control.step).toPrecision(12))
  if (control.integer) value = Math.round(value)
  return Math.min(control.max, Math.max(control.min, value))
}

/** Explicit keyboard increments avoid native range rounding of off-grid saved values. */
export function numericControlKey(value, key, control) {
  if (key === 'Home') return control.min
  if (key === 'End') return control.max
  const directions = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
  if (!Object.hasOwn(directions, key)) return null
  return numericControlValue(Number((value + directions[key] * control.step).toPrecision(12)), control)
}
