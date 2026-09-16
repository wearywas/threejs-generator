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
  "prompt": "A contemporary neighborhood streetlight, approximately 5.5 meters tall. A slender dark graphite metal pole, a small mounting foot, and a gently curved short arm supporting a slim downward-facing lamp head. Orient the arm toward positive Z. Keep the illuminated underside of the lamp head as a separate mesh named ‘lampGlow’, using a warm cream emissive material. Model the fixture only; do not add a scene light, visible light beam, pavement, or surrounding scene.",
  "family": "tower",
  "spec": null,
  "schema": null,
  "seed": 1311116092,
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
  group.name = "ContemporaryStreetlight";
  const geometries = new Set();
  const materials = new Set();
  const instances = [];

  function material(name, options) {
    const m = new THREE.MeshStandardMaterial(options);
    m.name = name;
    materials.add(m);
    return m;
  }
  const graphite = material("Graphite powder-coated metal", {
    color: params.bodyColor ?? "#30363a", metalness: 0.7, roughness: 0.43
  });
  const gasket = material("Underside perimeter gasket", {
    color: "#161c20", roughness: 0.8, metalness: 0.1
  });
  const steel = material("Mounting hardware", {
    color: "#70777a", roughness: 0.36, metalness: 0.85
  });
  const cream = material("Warm cream emissive diffuser", {
    color: "#fff0d1", emissive: "#ffe1a3",
    emissiveIntensity: 1.5, roughness: 0.48, metalness: 0
  });

  function mesh(name, geo, mat, x = 0, y = 0, z = 0) {
    geometries.add(geo);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  function roundedShape(width, length, radius) {
    const s = new THREE.Shape();
    const x = width / 2, z = length / 2, r = radius;
    s.moveTo(-x + r, -z);
    s.lineTo(x - r, -z);
    s.quadraticCurveTo(x, -z, x, -z + r);
    s.lineTo(x, z - r);
    s.quadraticCurveTo(x, z, x - r, z);
    s.lineTo(-x + r, z);
    s.quadraticCurveTo(-x, z, -x, z - r);
    s.lineTo(-x, -z + r);
    s.quadraticCurveTo(-x, -z, -x + r, -z);
    s.closePath();
    return s;
  }
  function roundedPlate(name, width, length, thickness, radius, topY, z, mat) {
    const geo = new THREE.ExtrudeGeometry(roundedShape(width, length, radius), {
      depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 6
    });
    geo.rotateX(Math.PI / 2);
    return mesh(name, geo, mat, 0, topY, z);
  }

  roundedPlate("Compact mounting foot", 0.29, 0.32, 0.035, 0.035, 0.035, 0, graphite);
  mesh("Pole base collar", new THREE.CylinderGeometry(0.078, 0.091, 0.14, 20),
    graphite, 0, 0.097, 0);
  mesh("Tapered graphite pole", new THREE.CylinderGeometry(0.043, 0.064, 4.91, 20),
    graphite, 0, 0.07 + 4.91 / 2, 0);

  const boltGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.013, 6);
  geometries.add(boltGeo);
  const bolts = new THREE.InstancedMesh(boltGeo, steel, 4);
  bolts.name = "Four mounting bolts";
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const x of [-0.103, 0.103]) {
    for (const z of [-0.117, 0.117]) {
      dummy.position.set(x, 0.0415, z);
      dummy.updateMatrix();
      bolts.setMatrixAt(index++, dummy.matrix);
    }
  }
  bolts.instanceMatrix.needsUpdate = true;
  bolts.castShadow = true;
  group.add(bolts);
  instances.push(bolts);

  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 4.945, 0),
    new THREE.Vector3(0, 5.435, 0),
    new THREE.Vector3(0, 5.435, 0.29),
    new THREE.Vector3(0, 5.435, 0.79)
  );
  mesh("Gently swept short arm", new THREE.TubeGeometry(curve, 28, 0.043, 12, false), graphite);

  // The arm enters the rear of the housing; all underside layers have
  // distinct physical elevations, rather than coplanar overlays.
  roundedPlate("Slim lamp housing", 0.30, 0.86, 0.112, 0.105, 5.5, 1.055, graphite);
  roundedPlate("Recessed dark diffuser surround", 0.258, 0.73, 0.008, 0.084,
    5.391, 1.077, gasket);
  const glow = roundedPlate("lampGlow", 0.224, 0.677, 0.009, 0.073,
    5.385, 1.083, cream);
  glow.castShadow = false;

  const height = Number.isFinite(params.height)
    ? THREE.MathUtils.clamp(params.height, 3, 8) : 5.5;
  group.scale.setScalar(height / 5.5);
  group.userData = { units: "meters", armDirection: "+Z", height: height };

  return {
    root: group,
    dispose: () => {
      instances.forEach(m => m.dispose());
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}
