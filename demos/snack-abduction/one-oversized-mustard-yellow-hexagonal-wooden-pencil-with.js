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
  "prompt": "One oversized mustard-yellow hexagonal wooden pencil with an exposed wooden tip, graphite point, metal ferrule, and coral eraser. Lying flat along the X axis. Bold, simple proportions suitable for use as a barrier in a miniature desktop game.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 4009331550,
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
  group.name = "Oversized mustard hexagonal pencil";
  const geometries = new Set();
  const materials = new Set();
  const centerY = 0.45;

  function material(name, color, roughness, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    materials.add(m);
    return m;
  }
  const paint = material("Mustard-yellow lacquer", 0xdca929, 0.48);
  const wood = material("Fresh exposed cedar", 0xe4bd87, 0.86);
  const graphite = material("Graphite", 0x303239, 0.48, 0.12);
  const silver = material("Satin aluminum ferrule", 0xb9c3c8, 0.32, 0.8);
  const coral = material("Coral rubber eraser", 0xef796f, 0.92);

  function mesh(name, geometry, mat) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }

  // Six continuous, flat side faces; matching boundaries join the painted
  // shaft and sharpened wood without overlapping exposed surfaces.
  function hexSection(name, left, right, leftRadius, rightRadius, mat) {
    const positions = [];
    function point(x, r, i) {
      const a = i * Math.PI / 3;
      return [x, centerY + Math.cos(a) * r, Math.sin(a) * r];
    }
    function triangle(a, b, c) {
      positions.push(...a, ...b, ...c);
    }
    for (let i = 0; i < 6; i++) {
      const a = point(left, leftRadius, i);
      const b = point(left, leftRadius, i + 1);
      const c = point(right, rightRadius, i + 1);
      const d = point(right, rightRadius, i);
      triangle(a, b, c);
      triangle(a, c, d);
      triangle([left, centerY, 0], b, a);
      triangle([right, centerY, 0], d, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return mesh(name, geometry, mat);
  }

  hexSection("Long hexagonal mustard shaft", -2.85, 3.04, 0.45, 0.45, paint);
  hexSection("Six broad sharpened cedar facets", -4.12, -2.85, 0.105, 0.45, wood);
  hexSection("Exposed graphite point", -4.5, -4.12, 0.008, 0.105, graphite);

  function axialCylinder(name, left, right, radius, mat, segments = 32) {
    const geometry = new THREE.CylinderGeometry(radius, radius, right - left, segments);
    geometry.rotateZ(-Math.PI / 2);
    const object = mesh(name, geometry, mat);
    object.position.set((left + right) / 2, centerY, 0);
    return object;
  }

  axialCylinder("Metal ferrule sleeve", 2.98, 3.77, 0.437, silver);

  // Raised rolled beads physically project from the sleeve.
  const ringGeometry = new THREE.TorusGeometry(0.437, 0.013, 6, 32);
  ringGeometry.rotateY(Math.PI / 2);
  geometries.add(ringGeometry);
  const ringPositions = [3.015, 3.09, 3.66, 3.735];
  const rings = new THREE.InstancedMesh(ringGeometry, silver, ringPositions.length);
  rings.name = "Rolled ferrule grip bands";
  const matrix = new THREE.Matrix4();
  ringPositions.forEach((x, i) => {
    matrix.makeTranslation(x, centerY, 0);
    rings.setMatrixAt(i, matrix);
  });
  rings.instanceMatrix.needsUpdate = true;
  rings.castShadow = rings.receiveShadow = true;
  group.add(rings);

  // A broad, nearly flat eraser end with a soft rounded shoulder.
  const eraserProfile = [
    [0, 0], [0.422, 0],
    [0.432, 0.055], [0.432, 0.56],
    [0.426, 0.625], [0.403, 0.67],
    [0.36, 0.70], [0.29, 0.72], [0, 0.72]
  ].map(p => new THREE.Vector2(p[0], p[1]));
  const eraserGeometry = new THREE.LatheGeometry(eraserProfile, 32);
  eraserGeometry.rotateZ(-Math.PI / 2);
  const eraser = mesh("Chunky coral eraser", eraserGeometry, coral);
  eraser.position.set(3.78, centerY, 0);
  // Seat the rubber just inside the open end of the ferrule.
  eraser.position.x = 3.755;
  eraser.scale.x = (4.5 - 3.755) / 0.72;

  const scale = Number(params && params.scale);
  if (Number.isFinite(scale) && scale > 0) {
    group.scale.setScalar(THREE.MathUtils.clamp(scale, 0.1, 10));
  }
  group.userData.axis = "X";
  group.userData.description = "Desktop-game pencil barrier; graphite at -X, coral eraser at +X.";

  return {
    root: group,
    dispose: () => {
      rings.dispose();
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}
