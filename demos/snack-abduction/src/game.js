export const WORLD = {
  width: 24, depth: 16, duration: 90,
  mug: { x: -7, z: -3.7, radius: 1.45 },
  obstacles: [{ x: 1, z: -3.8, halfWidth: 2.1, halfDepth: 1.3 }],
};

const locations = [
  [-6, 3], [-9.4, 5.4], [-2.7, 5.8], [2, 5.6], [7.2, 4.7], [9, 0],
  [6.8, -4.6], [3.4, -6.4], [-1.9, -5.7], [-10, -6], [-5.1, -0.5], [0, 0.7],
];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inMug = (x, z, radius = 0) => Math.hypot(x - WORLD.mug.x, z - WORLD.mug.z) <= WORLD.mug.radius + radius + 1e-9;
function inBook(x, z, radius = 0) {
  return WORLD.obstacles.some(o => {
    const px = clamp(x, o.x - o.halfWidth, o.x + o.halfWidth);
    const pz = clamp(z, o.z - o.halfDepth, o.z + o.halfDepth);
    return Math.hypot(x - px, z - pz) < radius || (radius === 0 && x === px && z === pz);
  });
}

function resolveBook(x, z, radius) {
  for (const o of WORLD.obstacles) {
    const px = clamp(x, o.x - o.halfWidth, o.x + o.halfWidth);
    const pz = clamp(z, o.z - o.halfDepth, o.z + o.halfDepth);
    const dx = x - px, dz = z - pz, length = Math.hypot(dx, dz);
    if (length >= radius) continue;
    if (length) {
      x += dx / length * (radius - length + 0.001);
      z += dz / length * (radius - length + 0.001);
    } else {
      const exits = [
        [x - (o.x - o.halfWidth - radius), o.x - o.halfWidth - radius - 0.001, z],
        [o.x + o.halfWidth + radius - x, o.x + o.halfWidth + radius + 0.001, z],
        [z - (o.z - o.halfDepth - radius), x, o.z - o.halfDepth - radius - 0.001],
        [o.z + o.halfDepth + radius - z, x, o.z + o.halfDepth + radius + 0.001],
      ].sort((a, b) => a[0] - b[0]);
      x = exits[0][1]; z = exits[0][2];
    }
  }
  return { x, z };
}

function move(entity, dx, dz, radius, avoidMug = false) {
  let { x, z } = resolveBook(entity.x, entity.z, radius);
  const blocked = (px, pz) => inBook(px, pz, radius) || avoidMug && inMug(px, pz, radius);
  const nextX = clamp(x + dx, -12 + radius, 12 - radius);
  if (!blocked(nextX, z)) x = nextX;
  const nextZ = clamp(z + dz, -8 + radius, 8 - radius);
  if (!blocked(x, nextZ)) z = nextZ;
  entity.x = x; entity.z = z;
}

function validDrop(x, z) {
  return Math.abs(x) < 11.6 && Math.abs(z) < 7.6 && !inBook(x, z, 0.4) && !inMug(x, z, 0.4);
}
function dropPosition(x, z) {
  if (validDrop(x, z)) return { x, z };
  for (let ring = 1; ring <= 80; ring++) {
    for (let a = 0; a < 16; a++) {
      const theta = a * Math.PI / 8;
      const nx = x + ring * 0.2 * Math.cos(theta), nz = z + ring * 0.2 * Math.sin(theta);
      if (validDrop(nx, nz)) return { x: nx, z: nz };
    }
  }
  return { x: -6, z: 3 };
}

export function createGame() {
  return {
    phase: 'ready', timeLeft: 90, elapsed: 0, score: 0, delivered: 0, swept: 0,
    player: { x: -6, z: 3, vx: 0, vz: 0, carrying: null, stun: 0 },
    robot: { x: 7, z: -3, angle: 0, cooldown: 0, bumpCooldown: 0, path: [], pathTarget: null, routeRetry: 0 },
    snacks: locations.map(([x, z], id) => {
      const kind = id % 3 === 2 ? 'doughnut' : 'biscuit';
      return { id, kind, x, z, status: 'ground', value: kind === 'biscuit' ? 100 : 250 };
    }),
    events: [], beam: false, pickupTarget: null, pickupProgress: 0, pickupCooldown: 0,
  };
}
export function startGame(state) {
  if (state.phase === 'ready') state.phase = 'playing';
  return state;
}
export function setPaused(state, paused) {
  if (paused && state.phase === 'playing') state.phase = 'paused';
  else if (!paused && state.phase === 'paused') state.phase = 'playing';
  return state;
}
function finish(state) {
  if (state.phase !== 'playing') return;
  state.phase = 'ended'; state.beam = false;
  state.events.push({ type: 'end' });
}
function dropCargo(state, delivered) {
  const snack = state.snacks.find(s => s.id === state.player.carrying);
  if (!snack) return;
  state.player.carrying = null;
  if (delivered) {
    snack.status = 'delivered'; snack.x = WORLD.mug.x; snack.z = WORLD.mug.z;
    state.delivered++; state.score += snack.value;
    state.events.push({ type: 'deliver', snackId: snack.id, x: snack.x, z: snack.z, value: snack.value });
  } else {
    Object.assign(snack, dropPosition(state.player.x, state.player.z));
    snack.status = 'ground'; state.pickupCooldown = 0.3;
    state.events.push({ type: 'drop', snackId: snack.id, x: snack.x, z: snack.z });
  }
}
function stepPlayer(state, input, dt) {
  const p = state.player;
  p.stun = Math.max(0, p.stun - dt);
  state.pickupCooldown = Math.max(0, state.pickupCooldown - dt);
  const cargo = state.snacks.find(s => s.id === p.carrying);
  const speed = cargo?.kind === 'doughnut' ? 3.6 : cargo ? 4.8 : 6;
  const ix = Number.isFinite(input?.x) ? input.x : 0, iz = Number.isFinite(input?.z) ? input.z : 0;
  const scale = Math.max(1, Math.hypot(ix, iz));
  const smoothing = 1 - Math.exp(-12 * dt);
  p.vx += ((p.stun ? 0 : ix / scale * speed) - p.vx) * smoothing;
  p.vz += ((p.stun ? 0 : iz / scale * speed) - p.vz) * smoothing;
  move(p, p.vx * dt, p.vz * dt, 0.7);
  if (cargo) { cargo.x = p.x; cargo.z = p.z; }

  state.beam = !!input?.beam && p.stun === 0;
  if (!state.beam) {
    state.pickupTarget = null; state.pickupProgress = 0;
    if (cargo) dropCargo(state, inMug(p.x, p.z));
    return;
  }
  if (cargo || state.pickupCooldown > 0) return;
  let nearest = null, best = 1.15;
  for (const snack of state.snacks) {
    if (snack.status !== 'ground') continue;
    const d = dist(p, snack);
    if (d <= best) { best = d; nearest = snack; }
  }
  if (!nearest) { state.pickupTarget = null; state.pickupProgress = 0; return; }
  if (state.pickupTarget !== nearest.id) { state.pickupTarget = nearest.id; state.pickupProgress = 0; }
  state.pickupProgress += dt;
  if (state.pickupProgress >= 0.25 - 1e-9) {
    nearest.status = 'carried'; nearest.x = p.x; nearest.z = p.z;
    p.carrying = nearest.id;
    state.pickupTarget = null; state.pickupProgress = 0;
    state.events.push({ type: 'pickup', snackId: nearest.id, x: p.x, z: p.z });
  }
}

// Four-neighbor grid search produces a deterministic route past the mug and books.
const gridX = col => -10.8 + col * 0.6;
const gridZ = row => -6.6 + row * 0.6;
function canCollectFrom(from, snack) {
  const length = dist(from, snack);
  if (length < 0.6) return true;
  const steps = Math.ceil(length / 0.1);
  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    const x = from.x + (snack.x - from.x) * fraction;
    const z = from.z + (snack.z - from.z) * fraction;
    if (Math.abs(x) > 11.4 || Math.abs(z) > 7.4 || inBook(x, z, 0.6) || inMug(x, z, 0.6)) return false;
    if (Math.hypot(x - snack.x, z - snack.z) < 0.59) return true;
  }
  return false;
}
function route(from, to) {
  if (canCollectFrom(from, to)) return [];
  const cols = 37, rows = 23;
  const cell = point => [clamp(Math.round((point.x + 10.8) / 0.6), 0, cols - 1),
    clamp(Math.round((point.z + 6.6) / 0.6), 0, rows - 1)];
  const [sc, sr] = cell(from);
  const start = sr * cols + sc;
  const parent = new Int32Array(cols * rows).fill(-1), queue = [start];
  parent[start] = start;
  let end = -1;
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    const c = key % cols, r = Math.floor(key / cols);
    const point = { x: gridX(c), z: gridZ(r) };
    if (!inBook(point.x, point.z, 0.65) && !inMug(point.x, point.z, 0.65) && canCollectFrom(point, to)) {
      end = key; break;
    }
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const next = nr * cols + nc;
      if (parent[next] !== -1 || inBook(gridX(nc), gridZ(nr), 0.65) || inMug(gridX(nc), gridZ(nr), 0.65)) continue;
      parent[next] = key; queue.push(next);
    }
  }
  if (end === -1) return null;
  const path = [];
  for (let key = end; key !== start; key = parent[key]) {
    path.push({ x: gridX(key % cols), z: gridZ(Math.floor(key / cols)) });
  }
  return path.reverse();
}
function stepRobot(state, dt) {
  const r = state.robot, p = state.player;
  r.cooldown = Math.max(0, r.cooldown - dt);
  r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
  r.routeRetry = Math.max(0, r.routeRetry - dt);
  if (r.cooldown === 0) {
    const ground = state.snacks.filter(s => s.status === 'ground')
      .sort((a, b) => dist(r, a) - dist(r, b) || a.id - b.id);
    let target = ground.find(s => s.id === r.pathTarget);
    if ((!target || r.path.length === 0) && r.routeRetry === 0) {
      target = null;
      for (const snack of ground) {
        const path = route(r, snack);
        if (path === null) continue;
        target = snack; r.path = path; r.pathTarget = snack.id;
        break;
      }
      if (!target) { r.path = []; r.pathTarget = null; r.routeRetry = 1; }
    }
    if (target) {
      let waypoint = r.path[0] || target;
      if (r.path.length && dist(r, waypoint) < 0.08) {
        r.path.shift(); waypoint = r.path[0] || target;
      }
      const dx = waypoint.x - r.x, dz = waypoint.z - r.z, length = Math.hypot(dx, dz);
      if (length > 0.001) {
        const travel = Math.min(length, 1.15 * dt);
        r.angle = Math.atan2(dx, dz);
        move(r, dx / length * travel, dz / length * travel, 0.6, true);
      }
      if (dist(r, target) < 0.6) {
        target.status = 'swept'; state.swept++; r.cooldown = 3;
        r.path = []; r.pathTarget = null;
        state.events.push({ type: 'sweep', snackId: target.id, x: target.x, z: target.z, value: target.value });
      }
    }
  }
  if (r.bumpCooldown === 0 && p.stun === 0 && !inMug(p.x, p.z) && dist(r, p) < 1) {
    if (p.carrying !== null) dropCargo(state, false);
    p.stun = 0.6; p.vx = 0; p.vz = 0; r.bumpCooldown = 2;
    state.beam = false; state.pickupTarget = null; state.pickupProgress = 0;
    state.events.push({ type: 'bump', x: p.x, z: p.z });
  }
}
export function stepGame(state, input = {}, dt = 0) {
  state.events = [];
  if (state.phase !== 'playing') return state;
  dt = Math.min(state.timeLeft, clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05));
  state.elapsed += dt;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft === 0 || !state.snacks.some(s => s.status === 'ground' || s.status === 'carried')) {
    finish(state); return state;
  }
  stepPlayer(state, input, dt);
  stepRobot(state, dt);
  if (!state.snacks.some(s => s.status === 'ground' || s.status === 'carried')) finish(state);
  return state;
}
