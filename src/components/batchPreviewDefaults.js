/** Derive default batch spacing from serialized runtime bounds. */
export function getBatchPreviewSpacing(asset) {
  const bounds = asset?.runtimeSignals?.bounds
  const validVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
  if (!validVector(bounds?.min) || !validVector(bounds?.max) || bounds.min.some((value, index) => value > bounds.max[index])) {
    return 4
  }

  // Wrappers rotate around the origin, which need not be the bounds' center.
  const radiusX = Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0]))
  const radiusZ = Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))
  // Default scale jitter is 0.2; add 10% breathing room and round up to tenths.
  const spacing = Math.ceil(Math.hypot(radiusX, radiusZ) * 2 * 1.2 * 1.1 * 10) / 10
  // Match the worker's upper spacing limit without changing the runtime contract.
  return Math.min(100, Math.max(4, spacing))
}
