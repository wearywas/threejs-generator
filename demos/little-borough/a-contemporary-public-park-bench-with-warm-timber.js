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
  "prompt": "A contemporary public park bench with warm timber slats for the seat and a gently angled backrest, supported by dark graphite metal legs and simple armrests. Keep the wood and metal on separate materials, and expose a woodColor parameter if possible. Make sure the arm rests are not going through the wood.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 370191295,
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
  params = params || {};
  const group = new THREE.Group();
  group.name = "Contemporary timber park bench";
  const geometries = new Set();
  const materials = new Set();
  const instances = [];

  const wood = new THREE.MeshStandardMaterial({
    color: params.woodColor ?? "#b9793f",
    roughness: 0.65,
    metalness: 0
  });
  wood.name = "Warm timber";
  const metal = new THREE.MeshStandardMaterial({
    color: "#30363a",
    roughness: 0.48,
    metalness: 0.72
  });
  metal.name = "Graphite powder-coated steel";
  const hardware = new THREE.MeshStandardMaterial({
    color: "#73797b",
    roughness: 0.38,
    metalness: 0.85
  });
  materials.add(wood);
  materials.add(metal);
  materials.add(hardware);

  let state = (Number(seed) || 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  // Fine longitudinal grain, neutral in color so woodColor remains effective.
  let grain;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(512, 64);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#e4dacc";
      ctx.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 150; i++) {
        const y = random() * 64;
        ctx.strokeStyle = `rgba(81,59,37,${0.025 + random() * 0.13})`;
        ctx.lineWidth = 0.2 + random() * 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(160, y + random() * 4 - 2, 350, y + random() * 4 - 2, 512, y);
        ctx.stroke();
      }
      grain = new THREE.CanvasTexture(canvas);
      grain.colorSpace = THREE.SRGBColorSpace;
      wood.map = grain;
      wood.bumpMap = grain;
      wood.bumpScale = 0.001;
    }
  }

  function mesh(name, geometry, material, x, y, z, parent = group) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(name, w, h, d, x, y, z, material = metal, parent = group) {
    return mesh(name, new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  }

  function beam(name, a, b, width, depth) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const center = start.clone().add(end).multiplyScalar(0.5);
    const object = box(name, width, start.distanceTo(end), depth, center.x, center.y, center.z);
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize()
    );
    return object;
  }

  // Beveled solid boards with lengthwise grain on the broad faces.
  function boardGeometry(length, height, depth) {
    const shape = new THREE.Shape();
    const bevel = 0.005;
    const x = length / 2 - bevel;
    const y = height / 2 - bevel;
    shape.moveTo(-x, -y);
    shape.lineTo(x, -y);
    shape.lineTo(x, y);
    shape.lineTo(-x, y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 1
    });
    geometry.translate(0, 0, -depth / 2 + bevel);
    const uv = geometry.getAttribute("uv");
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, positions.getX(i) / length + 0.5, positions.getY(i) / height + 0.5);
    }
    uv.needsUpdate = true;
    geometries.add(geometry);
    return geometry;
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function boards(name, geometry, placements, parent) {
    const batch = new THREE.InstancedMesh(geometry, wood, placements.length);
    batch.name = name;
    placements.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.rotation.set(p[3] || 0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      batch.setMatrixAt(i, dummy.matrix);
      color.setRGB(1, 1, 1).multiplyScalar(0.92 + random() * 0.08);
      batch.setColorAt(i, color);
    });
    batch.castShadow = batch.receiveShadow = true;
    batch.instanceMatrix.needsUpdate = true;
    parent.add(batch);
    instances.push(batch);
  }

  boards(
    "Five individually spaced timber seat slats",
    boardGeometry(1.94, 0.096, 0.036),
    Array.from({ length: 5 }, (_, i) => [0, 0.465, (i - 2) * 0.11, -Math.PI / 2]),
    group
  );

  // Longitudinal rails join both leg frames and reach the outboard arm posts.
  for (const z of [-0.205, 0.205]) {
    box("Seat underframe rail", 2.12, 0.065, 0.055, 0, 0.416, z);
  }

  for (const x of [-0.81, 0.81]) {
    box("Transverse seat bearer", 0.055, 0.055, 0.56, x, 0.42, 0);
    for (const z of [-0.205, 0.205]) {
      box("Square steel leg", 0.055, 0.39, 0.055, x, 0.22, z);
      box("Ground mounting foot", 0.135, 0.025, 0.12, x, 0.0125, z);
    }
    box("Lower leg-frame stretcher", 0.04, 0.04, 0.41, x, 0.14, 0);

    beam(
      "Backrest mounting bracket",
      [x, 0.40, -0.205],
      [x, 0.49, -0.296],
      0.045, 0.045
    );
  }

  const back = new THREE.Group();
  back.name = "Gently reclined backrest";
  back.position.set(0, 0.47, -0.255);
  back.rotation.x = -12 * Math.PI / 180;
  group.add(back);

  boards(
    "Three horizontal backrest slats",
    boardGeometry(1.94, 0.115, 0.035),
    [[0, 0.15, 0], [0, 0.285, 0], [0, 0.42, 0]],
    back
  );

  for (const x of [-0.81, 0.81]) {
    box("Rear steel backrest upright", 0.045, 0.55, 0.05, x, 0.205, -0.038, metal, back);
  }

  // Armrests lie entirely outside the timber ends: 39 mm minimum clearance.
  for (const x of [-1.035, 1.035]) {
    for (const z of [-0.205, 0.205]) {
      box("Outboard armrest post", 0.04, 0.285, 0.04, x, 0.5525, z);
    }
    box("Simple flat armrest", 0.052, 0.035, 0.55, x, 0.704, 0);
  }

  const boltGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.005, 8);
  geometries.add(boltGeometry);
  const bolts = new THREE.InstancedMesh(boltGeometry, hardware, 8);
  bolts.name = "Foot mounting bolts";
  let index = 0;
  for (const x of [-0.81, 0.81]) {
    for (const z of [-0.205, 0.205]) {
      for (const offset of [-0.045, 0.045]) {
        dummy.position.set(x + offset, 0.027, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        bolts.setMatrixAt(index++, dummy.matrix);
      }
    }
  }
  bolts.instanceMatrix.needsUpdate = true;
  bolts.castShadow = true;
  group.add(bolts);
  instances.push(bolts);

  group.userData = {
    units: "meters",
    seatHeight: 0.483,
    backrestReclineDegrees: 12,
    frontDirection: "+Z",
    woodColorParameter: "woodColor"
  };

  return {
    root: group,
    dispose: () => {
      instances.forEach(object => object.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      if (grain) grain.dispose();
    }
  };
}
