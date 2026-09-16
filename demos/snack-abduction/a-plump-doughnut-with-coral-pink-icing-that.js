// ThreeJS Generator asset v1
// Last successfully applied source, seed, parameters, controls, and texture inputs.
// Only execute source you trust; this module is not an isolation boundary.
// Usage in your Three.js project:
//   import * as THREE from 'three';
//   import { createSavedAsset } from './asset.js'; // Use this file's name.
//   const asset = createSavedAsset(THREE);
//   scene.add(asset.root);
// Supply any required runtime addons as createSavedAsset(THREE, {}, addons).
// Built-in addon import hints (app-specific helpers are not bundled):
// For animation, call asset.update/asset.tick in your render loop; dispose when done.
// Texture data URLs are embedded; other texture URLs still need to be reachable.

export const assetPreset = JSON.parse(String.raw`{
  "documentVersion": 1,
  "mode": "creative",
  "prompt": "A plump doughnut with coral-pink icing that drips irregularly around its edges, a clearly open central hole, and a modest scattering of colorful chunky sprinkles. Keep the icing in its own named group. One doughnut lying flat.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 1611991835,
  "params": {},
  "textureSlots": [],
  "textures": {},
  "restorationNotes": []
}`);

export function createSavedAsset(THREE, overrides = {}, addons) {
  // Give each invocation fresh inputs, even if the generated factory mutates them.
  const inputs = JSON.parse(JSON.stringify({
    seed: overrides.seed ?? assetPreset.seed,
    params: { ...assetPreset.params, ...overrides.params },
    textures: { ...assetPreset.textures, ...overrides.textures }
  }));
  return createAsset(THREE, inputs.seed, inputs.textures, inputs.params, addons);
}

export { createAsset };

// @threejs-generator-source
function createAsset(THREE, seed, textures, params, addons) {
  const group = new THREE.Group();
  group.name = "Coral iced doughnut";
  const icingGroup = new THREE.Group();
  icingGroup.name = "Icing";
  group.add(icingGroup);

  let s = (Number(seed) || 1) >>> 0;
  function random() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  }

  const geometries = [];
  const materials = [];
  const TAU = Math.PI * 2;
  const R = 1.13, r = 0.60, height = 0.48;
  const phase = random() * TAU;

  const doughMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86
  });
  const icingMat = new THREE.MeshStandardMaterial({
    color: 0xf58291,
    roughness: 0.3,
    metalness: 0
  });
  const sprinkleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.46
  });
  materials.push(doughMat, icingMat, sprinkleMat);

  function point(u, v, offset) {
    const wave = 0.012 * Math.sin(3 * u + phase) + 0.008 * Math.sin(7 * u - phase);
    const normal = new THREE.Vector3(
      Math.cos(v) * Math.cos(u) / r,
      Math.sin(v) / height,
      Math.cos(v) * Math.sin(u) / r
    ).normalize();
    return new THREE.Vector3(
      (R + wave + r * Math.cos(v)) * Math.cos(u),
      height + height * Math.sin(v),
      (R + wave + r * Math.cos(v)) * Math.sin(u)
    ).addScaledVector(normal, offset);
  }

  function geometry(positions, indices, colors) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    if (colors) g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    geometries.push(g);
    return g;
  }

  const N = 72, M = 24;
  const positions = [], indices = [], colors = [];
  const pale = new THREE.Color(0xf6c17a);
  const toasted = new THREE.Color(0xc47832);
  for (let i = 0; i < N; i++) {
    const u = i / N * TAU;
    for (let j = 0; j < M; j++) {
      const v = j / M * TAU;
      positions.push(...point(u, v, 0).toArray());
      const toast = THREE.MathUtils.clamp(
        0.38 - 0.27 * Math.sin(v) +
        0.1 * Math.cos(2 * v) + 0.055 * Math.sin(5 * u + phase),
        0, 1
      );
      const color = pale.clone().lerp(toasted, toast);
      colors.push(color.r, color.g, color.b);
      const a = i * M + j;
      const b = ((i + 1) % N) * M + j;
      const c = ((i + 1) % N) * M + (j + 1) % M;
      const d = i * M + (j + 1) % M;
      indices.push(a, d, b, b, d, c);
    }
  }
  const dough = new THREE.Mesh(geometry(positions, indices, colors), doughMat);
  dough.name = "Golden baked dough";
  dough.castShadow = true;
  dough.receiveShadow = true;
  group.add(dough);

  const drips = [];
  for (let i = 0; i < 11; i++) {
    drips.push({
      u: (i + random() * 0.55) / 11 * TAU,
      width: 0.08 + random() * 0.075,
      depth: 0.24 + random() * 0.48
    });
  }
  function edge(u, inner) {
    let amount = inner
      ? 0.025 + 0.055 * Math.sin(5 * u + phase)
      : -0.02 + 0.045 * Math.sin(6 * u + phase);
    for (let i = 0; i < drips.length; i++) {
      const drip = drips[i];
      const center = drip.u + (inner ? 0.21 : 0);
      const distance = Math.atan2(Math.sin(u - center), Math.cos(u - center));
      const width = drip.width * (inner ? 1.25 : 1);
      amount += drip.depth * (inner ? 0.4 : 1) *
        Math.exp(-Math.pow(distance / width, 2));
    }
    return inner ? Math.PI + amount : -amount;
  }

  const K = 14, row = K + 1, layer = N * row;
  const ip = [], ix = [];
  for (let shell = 0; shell < 2; shell++) {
    for (let i = 0; i < N; i++) {
      const u = i / N * TAU;
      const start = edge(u, false), end = edge(u, true);
      for (let j = 0; j <= K; j++) {
        const t = j / K;
        const v = start + (end - start) * t;
        const thickness = shell === 0
          ? 0.025 + 0.012 * Math.pow(Math.sin(Math.PI * t), 0.55)
          : 0.006;
        ip.push(...point(u, v, thickness).toArray());
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    for (let j = 0; j < K; j++) {
      const a = i * row + j, b = next * row + j;
      const c = b + 1, d = a + 1;
      ix.push(a, d, b, b, d, c);
      ix.push(a + layer, b + layer, d + layer,
        b + layer, c + layer, d + layer);
    }
    const a = i * row, b = next * row;
    ix.push(a, b, a + layer, b, b + layer, a + layer);
    const c = a + K, d = b + K;
    ix.push(c, c + layer, d, d, c + layer, d + layer);
  }
  const icing = new THREE.Mesh(geometry(ip, ix), icingMat);
  icing.name = "Irregular dripping coral glaze";
  icing.castShadow = true;
  icing.receiveShadow = true;
  icingGroup.add(icing);

  const sprinkleGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.14, 7, 1);
  geometries.push(sprinkleGeo);
  const count = 34;
  const sprinkles = new THREE.InstancedMesh(sprinkleGeo, sprinkleMat, count);
  sprinkles.name = "Chunky candy sprinkles";
  sprinkles.castShadow = true;
  sprinkles.receiveShadow = true;
  group.add(sprinkles);

  const palette = [0xffe276, 0x65d8ca, 0xfffaf0, 0x9773dd, 0xf44f67, 0x72bdf4];
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const placed = [];
  for (let i = 0; i < count; i++) {
    let u, v, p;
    for (let attempt = 0; attempt < 60; attempt++) {
      u = random() * TAU;
      v = 0.37 + random() * 2.38;
      p = point(u, v, 0.063);
      if (placed.every(q => q.distanceToSquared(p) > 0.026)) break;
    }
    placed.push(p.clone());
    const around = new THREE.Vector3(-Math.sin(u), 0, Math.cos(u));
    const across = new THREE.Vector3(
      -r * Math.sin(v) * Math.cos(u),
      height * Math.cos(v),
      -r * Math.sin(v) * Math.sin(u)
    ).normalize();
    const angle = random() * TAU;
    const direction = around.multiplyScalar(Math.cos(angle))
      .addScaledVector(across, Math.sin(angle)).normalize();
    dummy.position.copy(p);
    dummy.quaternion.setFromUnitVectors(up, direction);
    dummy.scale.set(1, 0.75 + random() * 0.5, 1);
    dummy.updateMatrix();
    sprinkles.setMatrixAt(i, dummy.matrix);
    sprinkles.setColorAt(i, new THREE.Color(palette[i % palette.length]));
  }
  sprinkles.instanceMatrix.needsUpdate = true;
  sprinkles.instanceColor.needsUpdate = true;

  return {
    root: group,
    dispose: () => {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      sprinkles.dispose();
    }
  };
}
