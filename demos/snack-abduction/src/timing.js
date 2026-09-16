import { stepGame } from './game.js';

// Separate render frequency from simulation steps; keep all events from this frame.
export function advanceGame(state, input, elapsed) {
  let remaining = Math.min(Math.max(Number.isFinite(elapsed) ? elapsed : 0, 0), 0.25);
  const events = [];
  if (state.phase !== 'playing' || remaining === 0) {
    state.events = [];
    return state;
  }
  while (remaining > 1e-9 && state.phase === 'playing') {
    const step = Math.min(remaining, 0.05);
    stepGame(state, input, step);
    events.push(...state.events);
    remaining -= step;
  }
  state.events = events;
  return state;
}
