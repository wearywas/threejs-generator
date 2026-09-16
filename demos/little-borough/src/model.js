export const MAX_FLOORS = 10;

const GRID = [-21, -7, 7, 21];

export const PLOTS = GRID.flatMap((z) => GRID.map((x) => ({ x, z })))
  .filter(({ x, z }) => Math.abs(x) === 21 || Math.abs(z) === 21)
  .map(({ x, z }, index) => ({
    id: `plot-${index}`,
    x,
    z,
    rotation: z === -21 ? Math.PI : z === 21 ? 0 : x === -21 ? -Math.PI / 2 : Math.PI / 2,
    label: `Plot ${index + 1}`,
  }));

// These five colors are the parameters consumed by the supplied apartment factory.
export const PALETTES = [
  { facadeColor: '#b7d1dc', accentColor: '#508573', woodColor: '#9d806b', windowColor: '#6e9da8', windowLightColor: '#f6dcb0' },
  { facadeColor: '#e4c3a3', accentColor: '#a47166', woodColor: '#876b58', windowColor: '#7296a0', windowLightColor: '#f8dfb5' },
  { facadeColor: '#b8d1b2', accentColor: '#64887a', woodColor: '#a0846b', windowColor: '#6c929d', windowLightColor: '#f6deb8' },
  { facadeColor: '#dfb5bb', accentColor: '#a57b83', woodColor: '#9e7d68', windowColor: '#7293a2', windowLightColor: '#f7ddbc' },
  { facadeColor: '#d7d5aa', accentColor: '#899869', woodColor: '#97765c', windowColor: '#7397a0', windowLightColor: '#f7e3bd' },
  { facadeColor: '#bfc1dc', accentColor: '#777f9f', woodColor: '#9c7d6b', windowColor: '#7298a7', windowLightColor: '#f9e0b7' },
  { facadeColor: '#e1c78b', accentColor: '#b48a65', woodColor: '#8c705d', windowColor: '#7197a2', windowLightColor: '#f7dfb0' },
  { facadeColor: '#afd2c9', accentColor: '#609196', woodColor: '#a08670', windowColor: '#7096a0', windowLightColor: '#f7e1bd' },
];

const PLOT_IDS = new Set(PLOTS.map(({ id }) => id));
const ENTRY_KEYS = ['floors', 'palette', 'seed'];

export function createCity() {
  return { version: 1, buildings: {} };
}

export function editPlot(city, id, delta, random = Math.random) {
  if (!PLOT_IDS.has(id) || (delta !== 1 && delta !== -1)) return city;

  const current = city.buildings[id];
  if (!current && delta === -1) return city;
  if (current?.floors === MAX_FLOORS && delta === 1) return city;

  const buildings = { ...city.buildings };
  if (!current) {
    buildings[id] = {
      floors: 1,
      seed: Math.floor(random() * 0x100000000) >>> 0,
      palette: Math.floor(random() * PALETTES.length),
    };
  } else if (current.floors === 1 && delta === -1) {
    delete buildings[id];
  } else {
    buildings[id] = { ...current, floors: current.floors + delta };
  }
  return { version: 1, buildings };
}

export function getStats(city) {
  const entries = Object.values(city.buildings);
  return {
    buildings: entries.length,
    floors: entries.reduce((sum, entry) => sum + entry.floors, 0),
    highest: entries.reduce((highest, entry) => Math.max(highest, entry.floors), 0),
  };
}

export function serializeCity(city) {
  return JSON.stringify(city);
}

function hasExactlyKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

export function deserializeCity(raw) {
  try {
    const city = JSON.parse(raw);
    if (!hasExactlyKeys(city, ['version', 'buildings']) || city.version !== 1) return createCity();
    if (city.buildings === null || typeof city.buildings !== 'object' || Array.isArray(city.buildings)) return createCity();

    const buildings = {};
    for (const [id, entry] of Object.entries(city.buildings)) {
      if (!PLOT_IDS.has(id) || !hasExactlyKeys(entry, ENTRY_KEYS)
        || !Number.isInteger(entry.floors) || entry.floors < 1 || entry.floors > MAX_FLOORS
        || !Number.isInteger(entry.seed) || entry.seed < 0 || entry.seed > 0xffffffff
        || !Number.isInteger(entry.palette) || entry.palette < 0 || entry.palette >= PALETTES.length) {
        return createCity();
      }
      buildings[id] = { floors: entry.floors, seed: entry.seed, palette: entry.palette };
    }
    return { version: 1, buildings };
  } catch {
    return createCity();
  }
}
