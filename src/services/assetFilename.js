/** Build a shared filename stem for portable asset downloads. */
export function assetFilenameStem(prompt, fallback = 'asset') {
  for (const candidate of [prompt, fallback]) {
    if (typeof candidate !== 'string') continue
    const words = candidate.normalize('NFKC').toLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)
    if (!words) continue

    let stem = ''
    for (const word of words.slice(0, 8)) {
      const next = stem ? `${stem}-${word}` : word
      if (Array.from(next).length > 60) {
        // Preserve complete words unless the first word alone exceeds the cap.
        if (!stem) stem = Array.from(word).slice(0, 60).join('')
        break
      }
      stem = next
    }

    // Windows reserves these names even when a file extension is appended.
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(stem) ? `asset-${stem}` : stem
  }
  return 'asset'
}
