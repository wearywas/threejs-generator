import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, createGame, startGame, setPaused, stepGame } from '../src/game.js';

const idle = { x: 0, z: 0, beam: false };
function advance(state, input, seconds) {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) stepGame(state, input, 0.05);
}
function quietRobot(state) {
  state.robot.x = 10;
  state.robot.z = -6;
  state.robot.cooldown = 100;
}

test('fresh round has twelve accessible snacks and resets score and statuses', () => {
  const first = createGame();
  assert.equal(first.phase, 'ready');
  assert.equal(first.timeLeft, 90);
  assert.equal(first.score, 0);
  assert.equal(first.delivered, 0);
  assert.equal(first.swept, 0);
  assert.equal(first.snacks.length, 12);
  assert.deepEqual([first.snacks[0].kind, first.snacks[0].x, first.snacks[0].z], ['biscuit', -6, 3]);
  assert.equal(first.snacks.every(s => s.status === 'ground' && s.value === (s.kind === 'biscuit' ? 100 : 250)), true);
  assert.equal(first.snacks.every(s => Math.abs(s.x) <= 11.3 && Math.abs(s.z) <= 7.3), true);
  assert.equal(first.snacks.every(s => Math.hypot(s.x - WORLD.mug.x, s.z - WORLD.mug.z) > WORLD.mug.radius), true);
  assert.equal(first.snacks.every(s => !WORLD.obstacles.some(o => Math.abs(s.x - o.x) < o.halfWidth && Math.abs(s.z - o.z) < o.halfDepth)), true);
  first.score = 999;
  first.snacks[0].status = 'delivered';
  assert.equal(createGame().score, 0);
  assert.equal(createGame().snacks[0].status, 'ground');
});

test('ready and paused phases do not advance; pausing toggles only an active game', () => {
  const state = createGame();
  stepGame(state, { x: 1, z: 0, beam: true }, 1);
  assert.equal(state.elapsed, 0);
  assert.equal(state.player.x, -6);
  setPaused(state, true);
  assert.equal(state.phase, 'ready');
  startGame(state);
  setPaused(state, true);
  advance(state, { x: 1, z: 0, beam: true }, 1);
  assert.equal(state.phase, 'paused');
  assert.equal(state.elapsed, 0);
  setPaused(state, false);
  stepGame(state, idle, 0.05);
  assert.equal(state.elapsed, 0.05);
});

test('beam needs a continuous quarter-second hold on the same nearby snack', () => {
  const state = createGame();
  quietRobot(state);
  startGame(state);
  advance(state, { ...idle, beam: true }, 0.2);
  assert.equal(state.player.carrying, null);
  stepGame(state, idle, 0.05);
  advance(state, { ...idle, beam: true }, 0.2);
  assert.equal(state.player.carrying, null);
  stepGame(state, { ...idle, beam: true }, 0.05);
  assert.equal(state.player.carrying, 0);
  assert.equal(state.snacks[0].status, 'carried');
  assert.equal(state.events[0].type, 'pickup');
});

test('release at mug delivers cargo once and awards its value once', () => {
  const state = createGame();
  quietRobot(state);
  startGame(state);
  advance(state, { ...idle, beam: true }, 0.25);
  state.player.x = WORLD.mug.x;
  state.player.z = WORLD.mug.z;
  stepGame(state, idle, 0.05);
  assert.equal(state.player.carrying, null);
  assert.equal(state.snacks[0].status, 'delivered');
  assert.equal(state.score, 100);
  assert.equal(state.delivered, 1);
  assert.equal(state.events.filter(e => e.type === 'deliver').length, 1);
  stepGame(state, idle, 0.05);
  assert.equal(state.score, 100);
  assert.equal(state.delivered, 1);
});

test('release outside mug makes an accessible ground snack without points', () => {
  const state = createGame();
  quietRobot(state);
  startGame(state);
  advance(state, { ...idle, beam: true }, 0.25);
  state.player.x = WORLD.obstacles[0].x;
  state.player.z = WORLD.obstacles[0].z;
  stepGame(state, idle, 0.05);
  const snack = state.snacks[0];
  assert.equal(snack.status, 'ground');
  assert.equal(state.score, 0);
  assert.equal(state.events[0].type, 'drop');
  assert.equal(WORLD.obstacles.some(o => Math.abs(snack.x - o.x) < o.halfWidth && Math.abs(snack.z - o.z) < o.halfDepth), false);
  assert.ok(Math.hypot(snack.x - WORLD.mug.x, snack.z - WORLD.mug.z) > WORLD.mug.radius);
  assert.equal(WORLD.obstacles.some(o => {
    const dx = Math.max(Math.abs(snack.x - o.x) - o.halfWidth, 0);
    const dz = Math.max(Math.abs(snack.z - o.z) - o.halfDepth, 0);
    return Math.hypot(dx, dz) < 0.7;
  }), false, 'the UFO can approach the dropped snack');
  advance(state, { ...idle, beam: true }, 0.25);
  assert.equal(state.player.carrying, null, 'drop cooldown prevents immediate recollection');
});

test('robot sweeps ground only, then enters a three-second cooldown', () => {
  const state = createGame();
  startGame(state);
  state.robot.x = 5;
  state.robot.z = 5;
  state.snacks[0].x = 5;
  state.snacks[0].z = 5;
  state.snacks[1].x = 5;
  state.snacks[1].z = 5;
  state.snacks[1].status = 'carried';
  state.player.carrying = state.snacks[1].id;
  state.player.x = -6;
  stepGame(state, { ...idle, beam: true }, 0.05);
  assert.equal(state.snacks[0].status, 'swept');
  assert.equal(state.snacks[1].status, 'carried');
  assert.equal(state.swept, 1);
  assert.ok(state.robot.cooldown >= 2.95);
  assert.equal(state.events[0].type, 'sweep');
});

test('robot bump drops cargo without scoring, stuns once, and mug protects player', () => {
  const state = createGame();
  startGame(state);
  state.player.carrying = 0;
  state.snacks[0].status = 'carried';
  state.player.x = 4;
  state.player.z = 3;
  state.robot.x = 4;
  state.robot.z = 3;
  stepGame(state, { ...idle, beam: true }, 0.05);
  assert.equal(state.player.carrying, null);
  assert.equal(state.snacks[0].status, 'ground');
  assert.equal(state.score, 0);
  assert.ok(state.player.stun >= 0.55);
  assert.equal(state.events.filter(e => e.type === 'bump').length, 1);
  stepGame(state, idle, 0.05);
  assert.equal(state.events.filter(e => e.type === 'bump').length, 0);
  state.player.x = WORLD.mug.x;
  state.player.z = WORLD.mug.z;
  state.robot.x = WORLD.mug.x;
  state.robot.z = WORLD.mug.z;
  state.robot.cooldown = 0;
  state.player.stun = 0;
  stepGame(state, idle, 0.05);
  assert.equal(state.player.stun, 0);
});

test('movement stays within tabletop and slides outside book, even from coincident center', () => {
  const state = createGame();
  quietRobot(state);
  startGame(state);
  state.player.x = 11.25;
  state.player.z = 7.25;
  advance(state, { x: 1, z: 1, beam: false }, 2);
  assert.ok(state.player.x <= 11.3 && state.player.z <= 7.3);
  state.player.x = -2;
  state.player.z = -3.8;
  state.player.vx = 0;
  state.player.vz = 0;
  advance(state, { x: 1, z: 1, beam: false }, 1);
  assert.ok(Number.isFinite(state.player.x) && Number.isFinite(state.player.z));
  assert.equal(WORLD.obstacles.some(o => Math.abs(state.player.x - o.x) < o.halfWidth + 0.69 && Math.abs(state.player.z - o.z) < o.halfDepth + 0.69), false);
  state.player.x = 1;
  state.player.z = -3.8;
  stepGame(state, idle, 0.05);
  assert.ok(Number.isFinite(state.player.x) && Number.isFinite(state.player.z));
});

test('a doughnut slows player more than a biscuit and diagonal input is normalized', () => {
  function distance(kind) {
    const state = createGame();
    quietRobot(state);
    startGame(state);
    state.player.x = -9;
    state.player.z = 0;
    if (kind) {
      const snack = state.snacks.find(s => s.kind === kind);
      snack.status = 'carried';
      state.player.carrying = snack.id;
    }
    advance(state, { x: 1, z: 1, beam: true }, 0.5);
    return Math.hypot(state.player.x + 9, state.player.z);
  }
  const empty = distance(null), biscuit = distance('biscuit'), doughnut = distance('doughnut');
  assert.ok(empty > biscuit && biscuit > doughnut);
  assert.ok(empty <= 3.1, 'diagonal speed cannot exceed straight speed');
});

test('large frame is clamped, timer ends exactly at zero, and no later scoring occurs', () => {
  const state = createGame();
  quietRobot(state);
  startGame(state);
  stepGame(state, idle, 20);
  assert.equal(state.elapsed, 0.05);
  state.timeLeft = 0.02;
  state.player.carrying = 0;
  state.snacks[0].status = 'carried';
  state.player.x = WORLD.mug.x;
  state.player.z = WORLD.mug.z;
  stepGame(state, { ...idle, beam: true }, 0.05);
  assert.equal(state.timeLeft, 0);
  assert.ok(Math.abs(state.elapsed - 0.07) < 1e-9, 'elapsed time stops at the timer boundary');
  assert.equal(state.phase, 'ended');
  assert.equal(state.beam, false);
  assert.equal(state.events.filter(e => e.type === 'end').length, 1);
  stepGame(state, idle, 0.05);
  assert.equal(state.events.length, 0);
  assert.equal(state.score, 0);
});

test('releasing at the mug rim counts as a delivery', () => {
  const state = createGame();
  quietRobot(state);
  startGame(state);
  advance(state, { ...idle, beam: true }, 0.25);
  state.player.x = WORLD.mug.x + WORLD.mug.radius;
  state.player.z = WORLD.mug.z;
  stepGame(state, idle, 0.05);
  assert.equal(state.delivered, 1);
});

test('round ends when all snacks are resolved and does not leave active beam', () => {
  const state = createGame();
  startGame(state);
  state.snacks.forEach(s => { s.status = 'delivered'; });
  stepGame(state, { ...idle, beam: true }, 0.05);
  assert.equal(state.phase, 'ended');
  assert.equal(state.beam, false);
  assert.equal(state.events.filter(e => e.type === 'end').length, 1);
});

test('robot routes around book and mug to reach ground snacks', () => {
  for (const [rx, rz, sx, sz] of [[4, -3.8, -2, -3.8], [-10, -3.7, -4.7, -3.7]]) {
    const state = createGame();
    startGame(state);
    state.player.x = 10; state.player.z = 6;
    state.robot.x = rx; state.robot.z = rz;
    state.snacks.forEach((snack, i) => { snack.status = i === 0 ? 'ground' : 'delivered'; });
    state.snacks[0].x = sx; state.snacks[0].z = sz;
    advance(state, idle, 12);
    assert.equal(state.swept, 1, 'robot should navigate around the obstacle');
  }
});

test('robot collects a legal mug-adjacent drop rather than stalling at the blocked grid cell', () => {
  const state = createGame();
  startGame(state);
  state.snacks.forEach((snack, i) => { snack.status = i === 0 ? 'carried' : 'delivered'; });
  state.player.carrying = 0;
  state.player.x = -7;
  state.player.z = -1.8;
  stepGame(state, idle, 0.05);
  assert.equal(state.snacks[0].status, 'ground');
  assert.deepEqual([state.snacks[0].x, state.snacks[0].z], [-7, -1.8]);
  state.player.x = 10;
  state.player.z = 6;
  advance(state, idle, 40);
  assert.equal(state.swept, 1, 'the robot should collect the dropped snack before timeout');
});

test('robot collects a legal book-adjacent drop from the opposite side', () => {
  const state = createGame();
  startGame(state);
  state.snacks.forEach((snack, i) => { snack.status = i === 0 ? 'carried' : 'delivered'; });
  state.player.carrying = 0;
  state.player.x = 3.8;
  state.player.z = -3.8;
  state.robot.x = -3;
  state.robot.z = -3.8;
  stepGame(state, idle, 0.05);
  assert.equal(state.snacks[0].status, 'ground');
  state.player.x = 10;
  state.player.z = 6;
  advance(state, idle, 35);
  assert.equal(state.swept, 1);
});

test('robot collects cargo dropped at the tabletop edge', () => {
  const state = createGame();
  startGame(state);
  state.snacks.forEach((snack, i) => { snack.status = i === 0 ? 'carried' : 'delivered'; });
  state.player.carrying = 0;
  state.player.x = 11.3;
  state.player.z = 7.3;
  stepGame(state, idle, 0.05);
  assert.equal(state.snacks[0].status, 'ground');
  state.player.x = -6;
  state.player.z = 3;
  advance(state, idle, 35);
  assert.equal(state.swept, 1);
});

test('robot skips an unreachable target and keeps collecting other ground snacks', () => {
  const state = createGame();
  startGame(state);
  state.player.x = 10;
  state.player.z = 6;
  state.robot.x = 4;
  state.robot.z = -3.8;
  state.snacks.forEach((snack, i) => { snack.status = i < 2 ? 'ground' : 'delivered'; });
  state.snacks[0].x = 1;
  state.snacks[0].z = -3.8;
  state.snacks[1].x = -5;
  state.snacks[1].z = 4;
  advance(state, idle, 40);
  assert.equal(state.snacks[0].status, 'ground');
  assert.equal(state.snacks[1].status, 'swept');
});
