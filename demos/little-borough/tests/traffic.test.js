import test from 'node:test';
import assert from 'node:assert/strict';
const { createRoadLoop } = await import('../src/traffic.js').catch(() => ({}));

const close = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
};

test('road follows the requested rounded rectangle bounds and perimeter', () => {
  assert.equal(typeof createRoadLoop, 'function');
  const road = createRoadLoop(35, 29, 9);
  close(road.length, 4 * (35 + 29 - 18) + 2 * Math.PI * 9);
  for (let i = 0; i <= 200; i++) {
    const { x, z, heading } = road.sample(road.length * i / 200);
    assert.ok(Math.abs(x) <= 35 + 1e-8);
    assert.ok(Math.abs(z) <= 29 + 1e-8);
    assert.ok(Number.isFinite(heading));
  }
});

test('samples wrap for negative and overlength travel', () => {
  const road = createRoadLoop();
  const a = road.sample(12.5);
  const b = road.sample(road.length + 12.5);
  const c = road.sample(12.5 - road.length);
  for (const other of [b, c]) {
    close(other.x, a.x);
    close(other.z, a.z);
    close(Math.sin(other.heading), Math.sin(a.heading));
    close(Math.cos(other.heading), Math.cos(a.heading));
  }
});

test('the curve and straight joins have continuous position and tangent', () => {
  const halfWidth = 35, halfDepth = 29, radius = 9;
  const road = createRoadLoop(halfWidth, halfDepth, radius);
  const straightX = 2 * (halfWidth - radius);
  const straightZ = 2 * (halfDepth - radius);
  const arc = Math.PI * radius / 2;
  const joins = [0, straightX, straightX + arc,
    straightX + arc + straightZ, straightX + 2 * arc + straightZ,
    2 * straightX + 2 * arc + straightZ, 2 * straightX + 3 * arc + straightZ,
    2 * straightX + 3 * arc + 2 * straightZ];
  const epsilon = 1e-5;
  for (const distance of joins) {
    const before = road.sample(distance - epsilon);
    const after = road.sample(distance + epsilon);
    assert.ok(Math.hypot(before.x - after.x, before.z - after.z) < 3 * epsilon);
    assert.ok(Math.abs(Math.sin(before.heading) - Math.sin(after.heading)) < 3 * epsilon / radius);
    assert.ok(Math.abs(Math.cos(before.heading) - Math.cos(after.heading)) < 3 * epsilon / radius);
  }
});

test('heading points in the direction of increasing distance', () => {
  const road = createRoadLoop();
  for (let i = 0; i < 64; i++) {
    const d = road.length * (i + 0.5) / 64;
    const a = road.sample(d);
    const b = road.sample(d + 1e-4);
    const dx = b.x - a.x, dz = b.z - a.z;
    close(dx / Math.hypot(dx, dz), Math.sin(a.heading), 2e-5);
    close(dz / Math.hypot(dx, dz), Math.cos(a.heading), 2e-5);
  }
});

test('invalid dimensions and sample distance are rejected', () => {
  for (const args of [[0, 35, 9], [35, -1, 9], [35, 35, 0], [35, 35, 36], [Infinity, 35, 9]]) {
    assert.throws(() => createRoadLoop(...args), RangeError);
  }
  assert.throws(() => createRoadLoop().sample(NaN), RangeError);
});
