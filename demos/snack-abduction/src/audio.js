export function createAudio() {
  let context;
  let muted = false;
  function unlock() {
    try {
      context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio is optional; the game still works without it. */ }
  }
  function tone(frequency, start, duration, volume = 0.07, type = 'sine', endFrequency = frequency) {
    if (muted || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function play(type) {
    if (!context || muted) return;
    const now = context.currentTime;
    if (type === 'pickup') tone(330, now, 0.23, 0.075, 'sine', 880);
    if (type === 'drop') tone(360, now, 0.12, 0.04, 'sine', 210);
    if (type === 'deliver') [523, 659, 784, 1047].forEach((f, i) => tone(f, now + i * 0.07, 0.28, 0.055));
    if (type === 'sweep') tone(160, now, 0.18, 0.035, 'triangle', 90);
    if (type === 'bump') tone(130, now, 0.25, 0.055, 'triangle', 55);
    if (type === 'start') [392, 523, 659].forEach((f, i) => tone(f, now + i * 0.1, 0.18, 0.045));
    if (type === 'end') [659, 587, 523, 784].forEach((f, i) => tone(f, now + i * 0.17, 0.4, 0.05));
  }
  return { unlock, play, setMuted(value) { muted = value; }, dispose() { context?.close().catch(() => {}); } };
}
