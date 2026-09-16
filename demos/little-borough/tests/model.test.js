import test from 'node:test';
import assert from 'node:assert/strict';
const {
  MAX_FLOORS, PLOTS, PALETTES, createCity, editPlot, getStats,
  serializeCity, deserializeCity,
} = await import('../src/model.js').catch(() => ({}));

test('twelve distinct roadside plots surround an empty center with outward fronts', () => {
  assert.equal(MAX_FLOORS, 10);
  assert.equal(PLOTS.length, 12);
  assert.equal(new Set(PLOTS.map(({ id }) => id)).size, 12);
  const positions = new Set(PLOTS.map(({ x, z }) => `${x},${z}`));
  assert.equal(positions.size, 12);
  assert.ok(!positions.has('-7,-7'));
  assert.ok(!positions.has('-7,7'));
  assert.ok(!positions.has('7,-7'));
  assert.ok(!positions.has('7,7'));
  for (const { x, z, rotation, label } of PLOTS) {
    assert.ok([-21, -7, 7, 21].includes(x) && [-21, -7, 7, 21].includes(z));
    assert.ok(typeof label === 'string' && label.length > 0);
    const expected = z === -21 ? Math.PI : z === 21 ? 0 : x === -21 ? -Math.PI / 2 : Math.PI / 2;
    assert.equal(rotation, expected);
  }
});

test('palettes provide coordinated colors for every building material', () => {
  assert.ok(PALETTES.length >= 8);
  for (const palette of PALETTES) {
    assert.deepEqual(Object.keys(palette).sort(), [
      'accentColor', 'facadeColor', 'windowColor', 'windowLightColor', 'woodColor',
    ]);
    for (const value of Object.values(palette)) assert.match(value, /^#[0-9a-f]{6}$/i);
  }
});

test('clicking a plot adds one floor and preserves previous snapshot', () => {
  const id = PLOTS[0].id;
  const empty = createCity();
  assert.deepEqual(empty, { version: 1, buildings: {} });
  const one = editPlot(empty, id, 1, () => 0.5);
  assert.equal(one.buildings[id].floors, 1);
  assert.ok(Number.isInteger(one.buildings[id].seed));
  assert.ok(one.buildings[id].seed >= 0 && one.buildings[id].seed <= 0xffffffff);
  assert.ok(Number.isInteger(one.buildings[id].palette));
  assert.ok(one.buildings[id].palette >= 0 && one.buildings[id].palette < PALETTES.length);
  assert.deepEqual(empty, { version: 1, buildings: {} });
  assert.notStrictEqual(one, empty);
  assert.notStrictEqual(one.buildings, empty.buildings);
});

test('building upward keeps seed and palette and reaches the ten floor cap', () => {
  const id = PLOTS[0].id;
  let city = editPlot(createCity(), id, 1, () => 0.25);
  const { seed, palette } = city.buildings[id];
  for (let i = 1; i < MAX_FLOORS; i++) {
    city = editPlot(city, id, 1, () => { throw new Error('random must only run for new buildings'); });
  }
  assert.deepEqual(city.buildings[id], { floors: 10, seed, palette });
  assert.strictEqual(editPlot(city, id, 1), city);
});

test('removing floors deletes a zero floor building and leaves undo snapshot intact', () => {
  const id = PLOTS[1].id;
  const one = editPlot(createCity(), id, 1, () => 0);
  const two = editPlot(one, id, 1);
  const backToOne = editPlot(two, id, -1);
  const empty = editPlot(backToOne, id, -1);
  assert.deepEqual(backToOne.buildings[id], one.buildings[id]);
  assert.ok(!(id in empty.buildings));
  assert.equal(one.buildings[id].floors, 1);
  assert.equal(two.buildings[id].floors, 2);
  assert.strictEqual(editPlot(empty, id, -1), empty);
});

test('unknown plots and unsupported edits are no-ops', () => {
  const city = createCity();
  for (const [id, delta] of [['other', 1], ['__proto__', 1], [PLOTS[0].id, 0], [PLOTS[0].id, 2]]) {
    assert.strictEqual(editPlot(city, id, delta), city);
  }
});

test('statistics count occupied plots, all floors, and highest building', () => {
  let city = createCity();
  assert.deepEqual(getStats(city), { buildings: 0, floors: 0, highest: 0 });
  city = editPlot(city, PLOTS[0].id, 1, () => 0);
  city = editPlot(city, PLOTS[0].id, 1);
  city = editPlot(city, PLOTS[1].id, 1, () => 0.5);
  assert.deepEqual(getStats(city), { buildings: 2, floors: 3, highest: 2 });
});

test('a saved city round trips without sharing editable objects', () => {
  const city = editPlot(createCity(), PLOTS[0].id, 1, () => 0.75);
  const restored = deserializeCity(serializeCity(city));
  assert.deepEqual(restored, city);
  assert.notStrictEqual(restored, city);
  assert.notStrictEqual(restored.buildings[PLOTS[0].id], city.buildings[PLOTS[0].id]);
});

test('corrupt saves are rejected as an empty city', () => {
  const id = PLOTS[0].id;
  const entry = { floors: 1, seed: 4294967295, palette: 0 };
  const invalid = [
    'not json', 'null', '{}',
    JSON.stringify({ version: 2, buildings: { [id]: entry } }),
    JSON.stringify({ version: 1, buildings: { other: entry } }),
    JSON.stringify({ version: 1, buildings: { [id]: { ...entry, floors: 11 } } }),
    JSON.stringify({ version: 1, buildings: { [id]: { ...entry, seed: -1 } } }),
    JSON.stringify({ version: 1, buildings: { [id]: { ...entry, palette: PALETTES.length } } }),
    JSON.stringify({ version: 1, buildings: { [id]: { ...entry, extra: true } } }),
    '{"version":1,"buildings":{"__proto__":{"floors":1,"seed":1,"palette":0}}}',
    '{"version":1,"buildings":{"constructor":{"floors":1,"seed":1,"palette":0}}}',
  ];
  for (const raw of invalid) assert.deepEqual(deserializeCity(raw), createCity(), raw);
  assert.equal(Object.prototype.polluted, undefined);
});
