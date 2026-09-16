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
  "prompt": "A charming miniature flying saucer with a flattened teal body, an amber cockpit dome, a cream underside, and a separate luminous ring underneath for a tractor beam emitter. Three small landing feet and a few coral indicator lights. Strong silhouette from above and at a three-quarter angle. Name the underside ring ‘beamRing’. Do not include the tractor beam itself.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 3939072105,
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
  group.name = "Little Teal Saucer";
  const geometries = new Set();
  const materials = new Set();

  function material(color, options = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.36, ...options });
    materials.add(m);
    return m;
  }
  function geometry(g) {
    geometries.add(g);
    return g;
  }
  function mesh(g, m, name, x = 0, y = 0, z = 0) {
    const obj = new THREE.Mesh(geometry(g), m);
    obj.name = name;
    obj.position.set(x, y, z);
    obj.castShadow = true;
    obj.receiveShadow = true;
    group.add(obj);
    return obj;
  }
  function lathe(points, m, name) {
    return mesh(new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), 64), m, name);
  }
  function ring(radius, tube, y, m, name) {
    const obj = mesh(new THREE.TorusGeometry(radius, tube, 10, 64), m, name, 0, y, 0);
    obj.rotation.x = Math.PI / 2;
    return obj;
  }

  const teal = material(0x239b99, { metalness: 0.28 });
  const cream = material(0xffe9bb, { roughness: 0.49 });
  const dark = material(0x18545b, { metalness: 0.48 });
  const gold = material(0xf3bc58, { metalness: 0.5, roughness: 0.27 });
  const amber = material(0xffad35, {
    roughness: 0.19, metalness: 0.17,
    emissive: 0xb84c08, emissiveIntensity: 0.19
  });
  const coral = material(0xff7769, {
    emissive: 0xff4937, emissiveIntensity: 0.8, roughness: 0.25
  });
  const luminous = material(0xaffff0, {
    emissive: 0x54ffd9, emissiveIntensity: 2.1, roughness: 0.24
  });

  // Two complementary surfaces share a single rim boundary.
  lathe([
    [0, 0.64], [0.55, 0.64], [1.03, 0.67],
    [1.39, 0.75], [1.63, 0.83], [1.72, 0.89]
  ], cream, "Cream belly");
  lathe([
    [1.72, 0.89], [1.70, 0.95], [1.58, 1.035],
    [1.32, 1.13], [0.96, 1.205], [0.70, 1.23], [0, 1.23]
  ], teal, "Flattened teal hull");
  ring(1.712, 0.023, 0.904, dark, "Equatorial piping");

  mesh(new THREE.CylinderGeometry(0.733, 0.78, 0.072, 48),
    dark, "Cockpit gasket", 0, 1.231, 0);
  ring(0.714, 0.036, 1.275, gold, "Cockpit bezel");
  const dome = mesh(
    new THREE.SphereGeometry(0.70, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    amber, "Amber cockpit dome", 0, 1.272, 0
  );
  dome.scale.y = 0.80;

  // The open emitter is physically separated from the belly by short mounts.
  ring(0.665, 0.078, 0.439, dark, "Emitter housing");
  ring(0.665, 0.045, 0.375, luminous, "beamRing");

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  function instances(g, m, count, name, place) {
    const obj = new THREE.InstancedMesh(geometry(g), m, count);
    obj.name = name;
    obj.castShadow = true;
    obj.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      place(dummy, i);
      dummy.updateMatrix();
      obj.setMatrixAt(i, dummy.matrix);
    }
    obj.instanceMatrix.needsUpdate = true;
    group.add(obj);
    return obj;
  }
  function angle(i) { return i * Math.PI * 2 / 3 + Math.PI / 6; }

  instances(new THREE.CylinderGeometry(0.037, 0.037, 0.19, 8),
    gold, 3, "Emitter supports", (o, i) => {
      const a = angle(i);
      o.position.set(Math.cos(a) * 0.665, 0.561, Math.sin(a) * 0.665);
    });

  instances(new THREE.SphereGeometry(1, 12, 8),
    dark, 3, "Landing sockets", (o, i) => {
      const a = angle(i);
      o.position.set(Math.cos(a) * 1.02, 0.68, Math.sin(a) * 1.02);
      o.scale.set(0.14, 0.10, 0.14);
    });

  instances(new THREE.CylinderGeometry(0.053, 0.067, 1, 10),
    gold, 3, "Landing struts", (o, i) => {
      const a = angle(i);
      const start = new THREE.Vector3(Math.cos(a) * 1.02, 0.67, Math.sin(a) * 1.02);
      const end = new THREE.Vector3(Math.cos(a) * 1.19, 0.14, Math.sin(a) * 1.19);
      o.position.copy(start).add(end).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(up, start.clone().sub(end).normalize());
      o.scale.y = start.distanceTo(end);
    });

  instances(new THREE.SphereGeometry(1, 16, 8),
    cream, 3, "Three landing feet", (o, i) => {
      const a = angle(i);
      o.position.set(Math.cos(a) * 1.19, 0.105, Math.sin(a) * 1.19);
      o.rotation.y = -a;
      o.scale.set(0.24, 0.105, 0.175);
    });

  const lightCount = 5;
  function indicatorPose(o, i, lift, size) {
    const a = i * Math.PI * 2 / lightCount + 0.32;
    o.position.set(Math.cos(a) * 1.34, 1.128 + lift, Math.sin(a) * 1.34);
    o.quaternion.setFromUnitVectors(up,
      new THREE.Vector3(Math.cos(a) * 0.29, 1, Math.sin(a) * 0.29).normalize());
    o.scale.set(size, size * 0.46, size);
  }
  instances(new THREE.SphereGeometry(1, 12, 8),
    dark, lightCount, "Indicator bezels", (o, i) => indicatorPose(o, i, 0, 0.097));
  instances(new THREE.SphereGeometry(1, 12, 8),
    coral, lightCount, "Coral indicator lights", (o, i) => indicatorPose(o, i, 0.025, 0.067));

  return {
    root: group,
    update: (time, delta) => {
      luminous.emissiveIntensity = 2.1 + Math.sin(time * 1.8) * 0.18;
    },
    dispose: () => {
      group.traverse(o => {
        if (o.isInstancedMesh) o.dispose();
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}
