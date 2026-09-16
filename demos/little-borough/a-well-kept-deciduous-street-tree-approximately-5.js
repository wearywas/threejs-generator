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
  "mode": "procedural",
  "prompt": "A well-kept deciduous street tree, approximately 5 meters tall, with a slender brown trunk, a few visible branching limbs, and a rounded, slightly irregular canopy made from a modest number of overlapping foliage masses. Use several closely related natural green shades to give the crown depth. Keep the trunk and canopy in separate named groups. Expose a foliageColor parameter if possible, and use the seed to vary the canopy silhouette slightly. The trunk ends at ground level. No planter, pavement, grass patch, or surrounding scene.",
  "family": "treePlant",
  "spec": null,
  "schema": {
    "foliageColor": {
      "type": "color",
      "default": "#48743b",
      "label": "Foliage Color",
      "description": "Base color shared by the foliage masses, with related brightness shades."
    },
    "height": {
      "type": "number",
      "min": 2,
      "max": 10,
      "step": 0.1,
      "default": 5,
      "label": "Tree Height",
      "description": "Overall height in meters. Scales the complete tree while keeping its base at ground level."
    },
    "barkColor": {
      "type": "color",
      "default": "#70503a",
      "label": "Bark Color",
      "description": "Color of the trunk, root flare, and branching limbs."
    },
    "canopyWidth": {
      "type": "number",
      "min": 0.75,
      "max": 1.4,
      "step": 0.01,
      "default": 1,
      "label": "Canopy Width",
      "description": "Horizontal crown width multiplier. Foliage centers and supporting limbs move together, retaining an overlapping crown."
    },
    "trunkThickness": {
      "type": "number",
      "min": 0.7,
      "max": 1.6,
      "step": 0.01,
      "default": 1,
      "label": "Trunk and Limb Thickness",
      "description": "Radius multiplier for the trunk, root flare, and all limbs."
    },
    "foliageIrregularity": {
      "type": "number",
      "min": 0,
      "max": 2,
      "step": 0.05,
      "default": 1,
      "label": "Foliage Surface Irregularity",
      "description": "Strength of seeded surface ripples on each foliage mass. Zero removes ripples but retains the seeded lobe arrangement."
    },
    "shadeVariation": {
      "type": "number",
      "min": 0,
      "max": 2,
      "step": 0.05,
      "default": 1,
      "label": "Foliage Shade Variation",
      "description": "Brightness contrast between foliage masses. Zero uses the same base color throughout."
    },
    "limbCount": {
      "type": "number",
      "min": 0,
      "max": 8,
      "step": 1,
      "default": 3,
      "label": "Limb Count",
      "description": "Number of branching limbs, each with two connected tapered segments. Zero keeps only the main trunk. Independent of foliage count."
    },
    "foliageCount": {
      "type": "number",
      "min": 1,
      "max": 7,
      "step": 1,
      "default": 4,
      "label": "Foliage Mass Count",
      "description": "Total overlapping foliage masses, including one central upper mass. Supporting limbs adapt to the chosen crown."
    }
  },
  "seed": 292291116,
  "params": {
    "foliageColor": "#48743b",
    "height": 5,
    "barkColor": "#70503a",
    "canopyWidth": 1,
    "trunkThickness": 1,
    "foliageIrregularity": 1,
    "shadeVariation": 1,
    "limbCount": 4,
    "foliageCount": 3
  },
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
  let state = (Number(seed) || 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  function numeric(value, fallback, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? THREE.MathUtils.clamp(n, min, max) : fallback;
  }
  const height = numeric(params.height ?? 5, 5, 2, 10);
  const canopyWidth = numeric(params.canopyWidth ?? 1, 1, 0.75, 1.4);
  const trunkThickness = numeric(params.trunkThickness ?? 1, 1, 0.7, 1.6);
  const foliageIrregularity = numeric(params.foliageIrregularity ?? 1, 1, 0, 2);
  const shadeVariation = numeric(params.shadeVariation ?? 1, 1, 0, 2);
  const limbCount = Math.round(numeric(params.limbCount ?? 3, 3, 0, 8));
  const foliageCount = Math.round(numeric(params.foliageCount ?? 4, 4, 1, 7));
  const barkColor = params.barkColor ?? '#70503a';
  const foliageColor = params.foliageColor ?? '#48743b';

  const group = new THREE.Group();
  group.name = 'Deciduous Street Tree';
  const trunkGroup = new THREE.Group();
  trunkGroup.name = 'Trunk';
  const canopyGroup = new THREE.Group();
  canopyGroup.name = 'Canopy';
  group.add(trunkGroup, canopyGroup);

  const geometries = new Set();
  const materials = new Set();
  function material(color, roughness) {
    const m = new THREE.MeshStandardMaterial({ color, roughness });
    materials.add(m);
    return m;
  }
  function mesh(geometry, mat, parent, name) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const bark = material(barkColor, 0.95);
  const foliageBase = new THREE.Color(foliageColor);
  const greens = [0.90, 1.02, 0.96, 1.08].map((brightness) =>
    material(foliageBase.clone().multiplyScalar(1 + (brightness - 1) * shadeVariation), 0.91)
  );

  const rings = [
    [0, 0.225, 0, 0],
    [0.12, 0.185, 0, 0],
    [0.42, 0.132, 0.006, 0],
    [1.25, 0.113, 0.027, 0.015],
    [2.05, 0.095, 0.054, 0.018],
    [2.73, 0.075, 0.037, 0.033],
    [3.44, 0.035, 0.080, 0.020]
  ];
  const sides = 12;
  const positions = [];
  const indices = [];
  rings.forEach(([y, radius, x, z], j) => {
    radius *= trunkThickness;
    for (let i = 0; i < sides; i++) {
      const angle = i * Math.PI * 2 / sides;
      const rib = 1 + Math.cos(angle * 5) * (j < 2 ? 0.105 : 0.025);
      positions.push(x + Math.cos(angle) * radius * rib, y,
        z + Math.sin(angle) * radius * rib);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * sides + i;
      const b = j * sides + (i + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i, i + 1);
    const top = (rings.length - 1) * sides;
    indices.push(top, top + i + 1, top + i);
  }
  const trunkGeometry = new THREE.BufferGeometry();
  trunkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  trunkGeometry.setIndex(indices);
  trunkGeometry.computeVertexNormals();
  const trunk = mesh(trunkGeometry, bark, trunkGroup, 'Tapered trunk and root flare');

  function limb(start, end, baseRadius, tipRadius, name) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(
      tipRadius * trunkThickness, baseRadius * trunkThickness, direction.length(), 8, 1
    );
    geometry.translate(0, direction.length() / 2, 0);
    const branch = mesh(geometry, bark, trunk, name);
    branch.position.copy(a);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }

  // Keep the default seeded silhouette while allowing independent counts.
  const turn = random() * Math.PI * 2;
  const lobes = [];
  const sideCount = foliageCount - 1;
  for (let i = 0; i < sideCount; i++) {
    const angle = turn + i * Math.PI * 2 / sideCount + (random() - 0.5) * 0.23;
    const radius = 0.60 + random() * 0.12;
    const x = Math.cos(angle) * radius * canopyWidth;
    const z = Math.sin(angle) * radius * canopyWidth;
    const y = 3.48 + random() * 0.22;
    lobes.push({
      center: [x, y, z],
      scale: [(1.02 + random() * 0.13) * canopyWidth, 1.01 + random() * 0.15, (1.03 + random() * 0.12) * canopyWidth]
    });
  }
  // A central upper mass keeps even sparse crowns connected to the trunk.
  lobes.push({
    center: [0.06 * canopyWidth, 3.94, 0.015 * canopyWidth],
    scale: [1.13 * canopyWidth, 1.06, 1.12 * canopyWidth]
  });

  for (let i = 0; i < limbCount; i++) {
    const targetCount = Math.max(1, sideCount);
    const target = lobes[i % targetCount];
    let [x, y, z] = target.center;
    const cycle = Math.floor(i / targetCount);
    // Separate extra limbs within a shared mass instead of duplicating geometry.
    if (sideCount === 0 || cycle > 0) {
      const angle = turn + i * Math.PI * 2 / Math.max(1, limbCount);
      const spread = sideCount === 0 ? 0.38 : 0.20 + 0.025 * cycle;
      x += Math.cos(angle) * spread * canopyWidth;
      z += Math.sin(angle) * spread * canopyWidth;
      y += 0.035 * cycle;
    }
    const level = i % 3;
    const elbow = [x * 0.51, 2.68 + level * 0.09, z * 0.51];
    limb([0.045, 1.98 + level * 0.19, 0.02], elbow, 0.073, 0.047,
      'Ascending limb ' + (i + 1));
    limb(elbow, [x, y + 0.12, z], 0.049, 0.017,
      'Crown support ' + (i + 1));
  }

  lobes.forEach((lobe, i) => {
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const attribute = geometry.getAttribute('position');
    const phase = random() * 6.28;
    for (let v = 0; v < attribute.count; v++) {
      const x = attribute.getX(v);
      const y = attribute.getY(v);
      const z = attribute.getZ(v);
      const ripple = 1
        + 0.046 * foliageIrregularity * Math.sin(x * 5.1 + phase) * Math.cos(z * 4.3 - y * 2.7)
        + 0.022 * foliageIrregularity * Math.sin(y * 8.2 + z * 3.6 + phase);
      attribute.setXYZ(v, x * ripple, y * ripple, z * ripple);
    }
    geometry.computeVertexNormals();
    const matIndex = i === sideCount ? 3 : i % greens.length;
    const crown = mesh(geometry, greens[matIndex], canopyGroup, 'Foliage mass ' + (i + 1));
    crown.position.set(...lobe.center);
    crown.scale.set(...lobe.scale);
  });

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  group.scale.setScalar(height / bounds.max.y);
  group.userData.parameters = {
    foliageColor: '#' + foliageBase.getHexString(),
    barkColor: '#' + bark.color.getHexString(),
    height, canopyWidth, trunkThickness, foliageIrregularity, shadeVariation,
    limbCount, foliageCount
  };
  return {
    root: group,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
    }
  };
}
