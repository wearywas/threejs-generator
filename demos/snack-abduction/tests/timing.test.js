import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, stepGame } from '../src/game.js';
import { advanceGame } from '../src/timing.js';

test('a slow rendered frame advances the same gameplay time and movement as short frames', () => {
  const slow = startGame(createGame()), fast = startGame(createGame());
  const input = { x: 1, z: 0, beam: false };
  advanceGame(slow, input, 0.2);
  for (let i = 0; i < 4; i++) stepGame(fast, input, 0.05);
  assert.ok(Math.abs(slow.timeLeft - 89.8) < 1e-8);
  assert.ok(Math.abs(slow.player.x - fast.player.x) < 1e-8);
});

test('pickup events from an early substep survive the rest of the frame exactly once', () => {
  const state = startGame(createGame());
  for (let i = 0; i < 4; i++) stepGame(state, { beam: true }, 0.05);
  advanceGame(state, { beam: true }, 0.15);
  assert.equal(state.player.carrying, 0);
  assert.equal(state.events.filter(e => e.type === 'pickup').length, 1);
  advanceGame(state, { beam: true }, 0.1);
  assert.deepEqual(state.events, []);
});

test('ended and paused frames do not consume time or replay events', () => {
  const state = startGame(createGame());
  state.timeLeft = 0.04;
  advanceGame(state, {}, 0.2);
  assert.equal(state.phase, 'ended');
  assert.equal(state.events.filter(e => e.type === 'end').length, 1);
  advanceGame(state, {}, 0.1);
  assert.deepEqual(state.events, []);
  const paused = createGame(); paused.phase = 'paused';
  advanceGame(paused, { x: 1 }, 0.2);
  assert.equal(paused.timeLeft, 90);
});
