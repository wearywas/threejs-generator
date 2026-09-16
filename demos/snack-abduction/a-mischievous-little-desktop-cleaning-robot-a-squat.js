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
  "prompt": "A mischievous little desktop cleaning robot: a squat mustard-yellow circular body, dark rubber bumper, two expressive cyan eyes on its front, and two visible rotating brushes projecting from beneath its front corners. Separate brush groups named ‘leftBrush’ and ‘rightBrush’. Cute but determined, with its front facing positive Z.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 1701557048,
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
  group.name = "Mischievous desktop cleaning robot";
  const geometries = new Set();
  const materials = new Set();

  function mat(name, color, roughness, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    materials.add(m);
    return m;
  }
  function own(g) {
    geometries.add(g);
    return g;
  }
  function mesh(name, g, m, x, y, z, parent = group) {
    const o = new THREE.Mesh(own(g), m);
    o.name = name;
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function ellipsoid(name, m, x, y, z, sx, sy, sz) {
    const o = mesh(name, new THREE.SphereGeometry(1, 24, 12), m, x, y, z);
    o.scale.set(sx, sy, sz);
    return o;
  }
  function ring(name, radius, tube, y, m) {
    const o = mesh(name, new THREE.TorusGeometry(radius, tube, 8, 48), m, 0, y, 0);
    o.rotation.x = Math.PI / 2;
    return o;
  }
  const yellow = mat("Mustard enamel", 0xdba526, 0.37, 0.15);
  const gold = mat("Golden edge trim", 0xf2bf45, 0.4, 0.12);
  const rubber = mat("Soft charcoal rubber", 0x242d32, 0.92);
  const graphite = mat("Graphite mechanisms", 0x39454b, 0.56, 0.35);
  const visor = mat("Deep blue faceplate", 0x10252e, 0.27, 0.18);
  const bristle = mat("Blue grey brush bristles", 0x516d75, 0.92);
  const cyan = mat("Luminous cyan eyes", 0x5eeeff, 0.24);
  cyan.emissive.setHex(0x19dfff);
  cyan.emissiveIntensity = 1.65;
  const highlight = mat("Eye glints", 0xd7ffff, 0.22);
  highlight.emissive.setHex(0x9dfaff);
  highlight.emissiveIntensity = 0.8;

  const profile = [
    [0, 0.285], [0.60, 0.285], [0.77, 0.315], [0.85, 0.385],
    [0.865, 0.49], [0.85, 0.63], [0.80, 0.735],
    [0.69, 0.80], [0.48, 0.838], [0.25, 0.855], [0, 0.855]
  ];
  mesh("Squat circular mustard shell",
    new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 48),
    yellow, 0, 0, 0);
  mesh("Undercarriage", new THREE.CylinderGeometry(0.72, 0.67, 0.14, 40),
    graphite, 0, 0.29, 0);
  ring("Continuous dark rubber bumper", 0.831, 0.077, 0.397, rubber);
  ring("Upper bumper piping", 0.855, 0.016, 0.473, gold);

  // Wheels support the robot at Y=0, while the brushes sit just above the desk.
  const wheelGeo = own(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 20));
  const wheelHubGeo = own(new THREE.CylinderGeometry(0.069, 0.069, 0.145, 16));
  for (const side of [-1, 1]) {
    const wheel = mesh("Rubber drive wheel", wheelGeo, rubber, side * 0.64, 0.15, -0.19);
    wheel.rotation.z = Math.PI / 2;
    const hub = mesh("Wheel hub", wheelHubGeo, graphite, side * 0.64, 0.15, -0.19);
    hub.rotation.z = Math.PI / 2;
  }
  ellipsoid("Rear caster", rubber, 0, 0.095, -0.57, 0.105, 0.095, 0.105);

  // A projecting faceplate gives the eyes a clean, unobstructed front surface.
  ellipsoid("Rounded dark faceplate", visor, 0, 0.615, 0.778, 0.60, 0.202, 0.16);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = ellipsoid(
      side < 0 ? "Left cyan eye" : "Right cyan eye",
      cyan, side * 0.225, 0.625, 0.923, 0.103, 0.113, 0.026
    );
    eye.rotation.z = side * -0.16;
    eyes.push(eye);
    ellipsoid("Playful eye glint", highlight,
      side * 0.225 - 0.021, 0.669, 0.945, 0.023, 0.029, 0.008);

    const brow = mesh("Determined mustard brow",
      new THREE.BoxGeometry(0.238, 0.043, 0.061),
      yellow, side * 0.227, 0.737, 0.901);
    brow.rotation.z = side * 0.19;
  }
  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.074, 0.536, 0.925),
    new THREE.Vector3(0.009, 0.498, 0.936),
    new THREE.Vector3(0.108, 0.557, 0.922)
  );
  mesh("Cheeky little smirk", new THREE.TubeGeometry(smileCurve, 10, 0.011, 5, false),
    cyan, 0, 0, 0);

  // A small service lid and recessed-looking power button on the upper shell.
  mesh("Service hatch gasket", new THREE.CylinderGeometry(0.302, 0.306, 0.028, 32),
    graphite, 0, 0.854, -0.07);
  mesh("Mustard service hatch", new THREE.CylinderGeometry(0.28, 0.29, 0.026, 32),
    gold, 0, 0.879, -0.07);
  mesh("Power button collar", new THREE.CylinderGeometry(0.083, 0.09, 0.02, 20),
    rubber, 0, 0.901, -0.07);
  mesh("Cyan power button", new THREE.CylinderGeometry(0.06, 0.06, 0.014, 20),
    cyan, 0, 0.915, -0.07);

  const dummy = new THREE.Object3D();
  function instances(name, geometry, material, count, parent, place) {
    const o = new THREE.InstancedMesh(own(geometry), material, count);
    o.name = name;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      place(dummy, i);
      dummy.updateMatrix();
      o.setMatrixAt(i, dummy.matrix);
    }
    o.instanceMatrix.needsUpdate = true;
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }

  instances("Rear cooling slots", new THREE.BoxGeometry(0.033, 0.018, 0.14),
    graphite, 5, group, (o, i) => {
      const x = (i - 2) * 0.075;
      o.position.set(x, 0.814 - Math.abs(x) * 0.035, -0.48);
      o.rotation.x = 0.14;
    });

  let state = (Number(seed) || 1) >>> 0;
  function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  }
  const brushes = [];
  for (const side of [-1, 1]) {
    const x = side * 0.66, z = 0.66;
    const armStart = new THREE.Vector3(side * 0.44, 0.28, 0.39);
    const armEnd = new THREE.Vector3(x, 0.19, z);
    const arm = mesh("Brush suspension arm",
      new THREE.CylinderGeometry(0.046, 0.057, armStart.distanceTo(armEnd), 8),
      graphite, 0, 0, 0);
    arm.position.copy(armStart).add(armEnd).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), armEnd.clone().sub(armStart).normalize()
    );
    mesh("Brush drive spindle", new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12),
      graphite, x, 0.185, z);

    const brush = new THREE.Group();
    brush.name = side < 0 ? "leftBrush" : "rightBrush";
    brush.position.set(x, 0.092, z);
    group.add(brush);
    brushes.push(brush);

    mesh("Rotating brush backing", new THREE.CylinderGeometry(0.164, 0.182, 0.053, 24),
      rubber, 0, 0.024, 0, brush);
    mesh("Mustard brush hub", new THREE.CylinderGeometry(0.098, 0.114, 0.038, 20),
      yellow, 0, 0.065, 0, brush);

    // Three swept fan-shaped bristle bundles produce an unmistakable side-brush silhouette.
    instances("Swept radial bristles", new THREE.BoxGeometry(1, 1, 1),
      bristle, 36, brush, (o, i) => {
        const fan = Math.floor(i / 12);
        const t = (i % 12) / 11;
        const angle = fan * Math.PI * 2 / 3 + (t - 0.5) * 0.72;
        const length = 0.195 + random() * 0.035;
        o.position.set(Math.sin(angle) * 0.211, -0.019, Math.cos(angle) * 0.211);
        o.rotation.set(0.09, angle + side * 0.27, 0);
        o.scale.set(0.012, 0.039, length);
      });
  }

  const size = Number(params && params.scale);
  if (Number.isFinite(size) && size > 0) group.scale.setScalar(Math.max(0.1, Math.min(10, size)));
  group.userData.front = "+Z";
  group.userData.description = "Mustard desktop helper with cyan eyes and twin spinning side brushes";

  return {
    root: group,
    update: (time, delta) => {
      brushes[0].rotation.y = time * 5.5;
      brushes[1].rotation.y = -time * 5.5 + 0.4;
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
