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
  "prompt": "A chunky golden chocolate-chip biscuit with a slightly irregular round outline, gently raised edges, and distinct dark chocolate chunks. It should look delicious and remain recognizable at a small size. One biscuit lying flat.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 4275028518,
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
  params = params || {};
  let state = (Number(seed) || 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const geometries = [];
  const materials = [];
  const radius = 1.35;
  const phase = random() * Math.PI * 2;

  function outline(a) {
    return 1 + 0.027 * Math.sin(5 * a + phase)
      + 0.018 * Math.sin(9 * a - phase)
      + 0.009 * Math.cos(13 * a + 1);
  }
  function topHeight(r, a) {
    return 0.355 + 0.058 * Math.exp(-Math.pow((r - 0.81) / 0.19, 2))
      + 0.007 * Math.sin(a * 5 + phase) * r
      + 0.004 * Math.cos(a * 11) * r;
  }

  // A single closed surface owns the top, rounded rim, sides, and underside.
  const segments = 72;
  const rings = [
    [0.13, null], [0.29, null], [0.46, null], [0.62, null],
    [0.76, null], [0.86, null], [0.93, 0.372],
    [0.978, 0.319], [1, 0.237], [0.993, 0.137],
    [0.964, 0.061], [0.909, 0.018], [0.79, 0],
    [0.40, 0]
  ];
  const positions = [0, 0.355, 0];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  function addColor(r, y) {
    const toasted = r > 0.91 || y < 0.15;
    color.set(toasted ? 0xc98835 : 0xeeb653);
    color.multiplyScalar(0.95 + random() * 0.10);
    colors.push(color.r, color.g, color.b);
  }
  addColor(0, 0.355);

  for (const [r, fixedY] of rings) {
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      const y = fixedY === null
        ? topHeight(r, a) + (random() - 0.5) * 0.009
        : fixedY;
      const rr = radius * r * outline(a);
      positions.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
      addColor(r, y);
    }
  }
  for (let j = 0; j < segments; j++) {
    indices.push(0, 1 + (j + 1) % segments, 1 + j);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < segments; j++) {
      const a = 1 + k * segments + j;
      const b = 1 + k * segments + (j + 1) % segments;
      const c = a + segments;
      const d = b + segments;
      indices.push(a, b, c, b, d, c);
    }
  }
  const bottom = positions.length / 3;
  positions.push(0, 0, 0);
  addColor(0, 0);
  const last = 1 + (rings.length - 1) * segments;
  for (let j = 0; j < segments; j++) {
    indices.push(last + j, last + (j + 1) % segments, bottom);
  }

  const biscuitGeometry = new THREE.BufferGeometry();
  biscuitGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  biscuitGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  biscuitGeometry.setIndex(indices);
  biscuitGeometry.computeVertexNormals();
  geometries.push(biscuitGeometry);

  const biscuitMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.91,
    metalness: 0
  });
  materials.push(biscuitMaterial);

  // Fine baked pores are subtle enough not to obscure the bold silhouette.
  let poreTexture;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#bdbdbd";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1700; i++) {
      const value = Math.floor(100 + random() * 105);
      ctx.fillStyle = `rgb(${value},${value},${value})`;
      ctx.beginPath();
      ctx.arc(random() * 128, random() * 128, 0.3 + random() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    poreTexture = new THREE.CanvasTexture(canvas);
    poreTexture.wrapS = poreTexture.wrapT = THREE.RepeatWrapping;
    poreTexture.repeat.set(4, 4);
    const uv = [];
    for (let i = 0; i < positions.length; i += 3) {
      uv.push(positions[i] / (radius * 2) + 0.5, positions[i + 2] / (radius * 2) + 0.5);
    }
    biscuitGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    biscuitMaterial.bumpMap = poreTexture;
    biscuitMaterial.bumpScale = 0.012;
  }
  const biscuit = new THREE.Mesh(biscuitGeometry, biscuitMaterial);
  biscuit.name = "Golden baked biscuit";
  biscuit.castShadow = biscuit.receiveShadow = true;
  group.add(biscuit);

  const chunkShape = new THREE.Shape();
  chunkShape.moveTo(-0.46, -0.28);
  chunkShape.lineTo(-0.29, -0.40);
  chunkShape.lineTo(0.33, -0.35);
  chunkShape.lineTo(0.49, -0.17);
  chunkShape.lineTo(0.43, 0.30);
  chunkShape.lineTo(0.19, 0.40);
  chunkShape.lineTo(-0.39, 0.32);
  chunkShape.lineTo(-0.49, 0.09);
  chunkShape.closePath();
  const chunkGeometry = new THREE.ExtrudeGeometry(chunkShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.055,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1
  });
  chunkGeometry.rotateX(-Math.PI / 2);
  geometries.push(chunkGeometry);
  const chocolateMaterial = new THREE.MeshStandardMaterial({
    color: 0x34180e,
    roughness: 0.57,
    metalness: 0
  });
  materials.push(chocolateMaterial);

  const requestedCount = Number(params.chipCount);
  const count = Number.isFinite(requestedCount)
    ? Math.max(12, Math.min(25, Math.round(requestedCount)))
    : 20;
  const chunks = new THREE.InstancedMesh(chunkGeometry, chocolateMaterial, count);
  const dummy = new THREE.Object3D();
  const centers = [];
  for (let i = 0; i < count; i++) {
    let x, z, r, a;
    for (let attempt = 0; attempt < 160; attempt++) {
      a = random() * Math.PI * 2;
      r = Math.sqrt(random()) * 0.84;
      x = Math.cos(a) * r * radius;
      z = Math.sin(a) * r * radius;
      if (centers.every(p => Math.hypot(p[0] - x, p[1] - z) > 0.29)) break;
    }
    centers.push([x, z]);
    const size = 0.23 + random() * 0.095;
    dummy.position.set(x, topHeight(r, a) - 0.055, z);
    dummy.rotation.set((random() - 0.5) * 0.28, random() * Math.PI * 2, (random() - 0.5) * 0.28);
    dummy.scale.set(size, 0.25 + random() * 0.10, size * (0.85 + random() * 0.3));
    dummy.updateMatrix();
    chunks.setMatrixAt(i, dummy.matrix);
    color.set([0x34190f, 0x432116, 0x2d150f, 0x3b1c12][i % 4]);
    chunks.setColorAt(i, color);
  }
  chunks.name = "Embedded dark chocolate chunks";
  chunks.instanceMatrix.needsUpdate = true;
  chunks.castShadow = chunks.receiveShadow = true;
  group.add(chunks);

  return {
    root: group,
    dispose: () => {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      if (poreTexture) poreTexture.dispose();
      chunks.dispose();
    }
  };
}
