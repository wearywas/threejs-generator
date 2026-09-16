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
  "prompt": "A compact urban delivery van. Face the front toward positive Z. Keep the four wheels as separately named groups, with each group's origin at its axle center. Use a separately named material called ‘bodyPaint’ for the painted panels, and expose a bodyColor parameter. Start with a muted mustard-yellow paint color. No branding, text, driver, cargo, or surrounding scene.",
  "family": "tower",
  "spec": null,
  "schema": {
    "bodyColor": {
      "type": "color",
      "default": "#b59a49",
      "label": "Body Color",
      "description": "Color of all painted panels using the separately named bodyPaint material."
    },
    "paintRoughness": {
      "type": "number",
      "min": 0.15,
      "max": 0.9,
      "step": 0.01,
      "default": 0.38,
      "label": "Paint Roughness",
      "description": "Lower values give sharper reflections; higher values give a matte finish."
    },
    "paintMetalness": {
      "type": "number",
      "min": 0,
      "max": 1,
      "step": 0.01,
      "default": 0.25,
      "label": "Paint Metalness"
    },
    "glassColor": {
      "type": "color",
      "default": "#23343d",
      "label": "Glazing Color",
      "description": "Tint of the opaque windshield, cab windows, and mirror glass."
    },
    "trimColor": {
      "type": "color",
      "default": "#292c2d",
      "label": "Trim Color",
      "description": "Color of molded bumpers, window seals, mirrors, rub strips, and other plastic trim."
    },
    "wheelColor": {
      "type": "color",
      "default": "#b0b6b6",
      "label": "Wheel Metal Color",
      "description": "Color of the four steel rims and center caps."
    },
    "wheelVentCount": {
      "type": "integer",
      "min": 4,
      "max": 12,
      "default": 8,
      "label": "Vents per Wheel",
      "description": "Number of evenly spaced recessed vent details on each wheel. All four wheel groups retain their names and axle-centered origins."
    },
    "grilleSlatCount": {
      "type": "integer",
      "min": 2,
      "max": 6,
      "default": 3,
      "label": "Grille Slat Count",
      "description": "Number of horizontal slats fitted within the existing front grille."
    }
  },
  "seed": 525583470,
  "params": {
    "bodyColor": "#b59a49",
    "paintRoughness": 0.38,
    "paintMetalness": 0.25,
    "glassColor": "#23343d",
    "trimColor": "#292c2d",
    "wheelColor": "#b0b6b6",
    "wheelVentCount": 8,
    "grilleSlatCount": 3
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
  const bodyColor = params.bodyColor ?? '#b59a49';
  const glassColor = params.glassColor ?? '#23343d';
  const trimColor = params.trimColor ?? '#292c2d';
  const wheelColor = params.wheelColor ?? '#b0b6b6';
  const paintRoughness = Math.max(0.15, Math.min(0.9, params.paintRoughness ?? 0.38));
  const paintMetalness = Math.max(0, Math.min(1, params.paintMetalness ?? 0.25));
  const wheelVentCount = Math.max(4, Math.min(12, Math.round(params.wheelVentCount ?? 8)));
  const grilleSlatCount = Math.max(2, Math.min(6, Math.round(params.grilleSlatCount ?? 3)));
  const group = new THREE.Group();
  group.name = 'CompactDeliveryVan';
  const geometries = new Set();
  const materials = new Set();
  const instances = [];

  function material(name, color, roughness, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    materials.add(m);
    return m;
  }
  const paint = material('bodyPaint', bodyColor, paintRoughness, paintMetalness);
  const glass = material('Dark blue-gray glazing', glassColor, 0.19, 0.3);
  const trim = material('Charcoal molded trim', trimColor, 0.76);
  const rubber = material('Tire rubber', '#191c1e', 0.94);
  const metal = material('Satin wheel metal', wheelColor, 0.38, 0.75);
  const darkMetal = material('Recessed wheel metal', '#42494c', 0.48, 0.55);
  const seam = material('Panel joint shadows', '#514a33', 0.85);
  const headlamp = material('Headlight lenses', '#e4edf0', 0.22, 0.16);
  const red = material('Rear red lenses', '#a92b2b', 0.27);
  const amber = material('Amber lenses', '#d99532', 0.28);
  glass.side = THREE.DoubleSide;
  trim.side = THREE.DoubleSide;

  function mesh(name, geometry, mat, x = 0, y = 0, z = 0, parent = group) {
    geometries.add(geometry);
    const m = new THREE.Mesh(geometry, mat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(boxGeo);
  function box(name, w, h, d, mat, x, y, z, parent = group) {
    const m = mesh(name, boxGeo, mat, x, y, z, parent);
    m.scale.set(w, h, d);
    return m;
  }
  function polygon(name, points, mat) {
    const vertices = [];
    for (let i = 1; i < points.length - 1; i++) {
      vertices.push(...points[0], ...points[i], ...points[i + 1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return mesh(name, geo, mat);
  }
  function rod(name, a, b, radius, mat) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const m = mesh(name, new THREE.CylinderGeometry(radius, radius, direction.length(), 6), mat);
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return m;
  }

  const axleY = 0.365;
  const archRadius = 0.445;
  const bottom = 0.5;
  const profile = new THREE.Shape();
  profile.moveTo(-2.1, bottom);
  profile.lineTo(-2.1, 2.13);
  profile.lineTo(-1.96, 2.27);
  profile.lineTo(0.55, 2.27);
  profile.lineTo(1.43, 1.45);
  profile.lineTo(2.02, 1.32);
  profile.lineTo(2.14, 1.06);
  profile.lineTo(2.14, bottom);
  const archAngle = Math.asin((bottom - axleY) / archRadius);
  for (const z of [1.35, -1.34]) {
    profile.lineTo(z + archRadius * Math.cos(archAngle), bottom);
    profile.absarc(z, axleY, archRadius, archAngle, Math.PI - archAngle, false);
  }
  profile.lineTo(-2.1, bottom);
  profile.closePath();
  const shellGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.82, steps: 1, bevelEnabled: false, curveSegments: 16
  });
  shellGeo.rotateY(-Math.PI / 2);
  shellGeo.translate(0.91, 0, 0);
  mesh('Continuous painted body with wheel openings', shellGeo, paint);
  box('Recessed underbody', 1.44, 0.14, 3.77, trim, 0, 0.48, 0);

  function sidePolygon(name, side, yz, mat, clearance) {
    return polygon(name, yz.map(([z, y]) => [side * (0.91 + clearance), y, z]), mat);
  }
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'Left' : 'Right';
    sidePolygon(name + ' cab window seal', side, [
      [-0.19, 1.43], [1.31, 1.43], [0.48, 2.18], [-0.19, 2.18]
    ], trim, 0.009);
    sidePolygon(name + ' cab glass', side, [
      [-0.137, 1.485], [1.185, 1.485], [0.46, 2.126], [-0.137, 2.126]
    ], glass, 0.016);
    rod(name + ' quarter-light divider',
      [side * 0.931, 1.482, 0.92], [side * 0.931, 1.72, 0.92], 0.013, trim);
    const doorOutline = [
      [-0.25, 2.19], [-0.25, 0.61], [0.72, 0.61], [0.84, 0.79], [0.92, 1.38]
    ];
    for (let i = 0; i < doorOutline.length - 1; i++) {
      const a = doorOutline[i], b = doorOutline[i + 1];
      rod(name + ' cab door joint ' + i,
        [side * 0.914, a[1], a[0]], [side * 0.914, b[1], b[0]], 0.005, seam);
    }
    box(name + ' front door handle recess', 0.014, 0.07, 0.23, trim, side * 0.923, 1.315, -0.015);
    box(name + ' front door handle', 0.039, 0.032, 0.175, darkMetal, side * 0.94, 1.322, -0.015);
    const cargoOutline = [
      [-1.91, 0.72], [-1.91, 2.11], [-0.36, 2.11], [-0.36, 0.72]
    ];
    for (let i = 0; i < cargoOutline.length - 1; i++) {
      const a = cargoOutline[i], b = cargoOutline[i + 1];
      rod(name + ' cargo panel joint ' + i,
        [side * 0.914, a[1], a[0]], [side * 0.914, b[1], b[0]], 0.004, seam);
    }
    box(name + ' cargo door rub strip', 0.034, 0.095, 1.5, trim, side * 0.925, 0.965, -1.12);
    box(name + ' cab rub strip', 0.034, 0.095, 0.95, trim, side * 0.925, 0.965, 0.25);
    box(name + ' sill', 0.046, 0.10, 1.70, trim, side * 0.925, 0.57, 0.005);
    if (side === 1) {
      box('Sliding cargo door guide', 0.028, 0.038, 1.36, darkMetal, 0.927, 1.26, -1.17);
      box('Sliding cargo door handle', 0.048, 0.055, 0.20, trim, 0.946, 1.38, -0.57);
    } else {
      box('Fuel filler surround', 0.012, 0.19, 0.21, seam, -0.918, 1.11, -1.77);
      box('Painted fuel filler flap', 0.018, 0.166, 0.186, paint, -0.926, 1.11, -1.77);
    }
    box(name + ' mirror mounting foot', 0.055, 0.13, 0.13, trim, side * 0.93, 1.50, 1.13);
    box(name + ' mirror arm', 0.22, 0.055, 0.075, trim, side * 1.015, 1.53, 1.11);
    box(name + ' mirror housing', 0.18, 0.25, 0.19, trim, side * 1.14, 1.62, 1.11);
    box(name + ' mirror glass', 0.138, 0.205, 0.012, glass, side * 1.14, 1.62, 1.009);
    box(name + ' side indicator', 0.021, 0.048, 0.095, amber, side * 0.927, 1.28, 1.54);
  }
  function frontPoint(x, y, offset) {
    return [x, y + offset, 1.43 - (y - 1.45) * 0.88 / 0.82 + offset];
  }
  polygon('Windshield perimeter seal', [
    frontPoint(-0.835, 1.49, 0.008), frontPoint(0.835, 1.49, 0.008),
    frontPoint(0.835, 2.195, 0.008), frontPoint(-0.835, 2.195, 0.008)
  ], trim);
  polygon('Front windshield', [
    frontPoint(-0.784, 1.535, 0.014), frontPoint(0.784, 1.535, 0.014),
    frontPoint(0.784, 2.145, 0.014), frontPoint(-0.784, 2.145, 0.014)
  ], glass);
  for (const x of [-0.43, 0.36]) {
    rod('Windshield wiper', frontPoint(x - 0.24, 1.565, 0.035),
      frontPoint(x + 0.22, 1.595, 0.035), 0.012, trim);
  }
  box('Front bumper', 1.88, 0.205, 0.16, trim, 0, 0.615, 2.11);
  box('Front grille recess', 0.83, 0.235, 0.035, trim, 0, 0.966, 2.151);
  for (let i = 0; i < grilleSlatCount; i++) {
    box('Grille horizontal slat', 0.74, 0.017, 0.024, darkMetal, 0,
      0.89 + i * 0.142 / (grilleSlatCount - 1), 2.175);
  }
  for (const side of [-1, 1]) {
    box('Headlamp housing', 0.42, 0.205, 0.075, trim, side * 0.653, 1.17, 2.093);
    box('Headlamp lens', 0.335, 0.148, 0.018, headlamp, side * 0.628, 1.175, 2.14);
    box('Front amber indicator', 0.058, 0.147, 0.02, amber, side * 0.824, 1.175, 2.141);
  }
  box('Rear bumper step', 1.89, 0.19, 0.19, trim, 0, 0.6, -2.12);
  box('Rear door central joint', 0.012, 1.49, 0.01, seam, 0, 1.40, -2.106);
  // A slight physical projection prevents coplanar overlaps at joint crossings.
  box('Rear upper door joint', 1.48, 0.011, 0.01, seam, 0, 2.135, -2.107);
  box('Rear lower door joint', 1.48, 0.01, 0.01, seam, 0, 0.755, -2.107);
  box('Rear door handle', 0.064, 0.18, 0.053, trim, 0.09, 1.19, -2.132);
  for (const side of [-1, 1]) {
    box('Rear outer door joint', 0.011, 1.37, 0.01, seam, side * 0.74, 1.445, -2.106);
    for (const y of [0.92, 1.89]) {
      box('Rear door hinge', 0.10, 0.10, 0.047, darkMetal, side * 0.74, y, -2.127);
    }
    box('Rear light housing', 0.12, 0.54, 0.062, trim, side * 0.828, 1.045, -2.127);
    box('Rear brake lens', 0.089, 0.245, 0.018, red, side * 0.828, 1.155, -2.167);
    box('Rear indicator lens', 0.089, 0.105, 0.018, amber, side * 0.828, 0.971, -2.167);
    box('Rear reversing lens', 0.089, 0.085, 0.018, headlamp, side * 0.828, 0.866, -2.167);
  }
  box('High rear brake light', 0.32, 0.045, 0.03, red, 0, 2.17, -2.077);

  const tireGeo = new THREE.TorusGeometry(0.277, 0.088, 10, 32);
  tireGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.216, 0.216, 0.17, 24);
  rimGeo.rotateZ(Math.PI / 2);
  const insetGeo = new THREE.CylinderGeometry(0.171, 0.171, 0.012, 24);
  insetGeo.rotateZ(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.087, 0.087, 0.029, 16);
  capGeo.rotateZ(Math.PI / 2);
  const ventGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.008, 8);
  ventGeo.rotateZ(Math.PI / 2);
  [tireGeo, rimGeo, insetGeo, capGeo, ventGeo].forEach(g => geometries.add(g));
  for (const axle of [{ name: 'Front', z: 1.35 }, { name: 'Rear', z: -1.34 }]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = 'wheel' + axle.name + (side < 0 ? 'Left' : 'Right');
      wheel.position.set(side * 0.883, axleY, axle.z);
      wheel.userData.axleAxis = 'X';
      group.add(wheel);
      mesh('Tire', tireGeo, rubber, 0, 0, 0, wheel);
      mesh('Steel rim', rimGeo, metal, 0, 0, 0, wheel);
      mesh('Recessed steel dish', insetGeo, darkMetal, side * 0.092, 0, 0, wheel);
      mesh('Wheel center cap', capGeo, metal, side * 0.106, 0, 0, wheel);
      const vents = new THREE.InstancedMesh(ventGeo, rubber, wheelVentCount);
      vents.name = wheelVentCount === 8 ? 'Eight recessed wheel vents' : wheelVentCount + ' recessed wheel vents';
      const dummy = new THREE.Object3D();
      for (let i = 0; i < wheelVentCount; i++) {
        const a = i * Math.PI * 2 / wheelVentCount;
        dummy.position.set(side * 0.101, Math.cos(a) * 0.14, Math.sin(a) * 0.14);
        dummy.updateMatrix();
        vents.setMatrixAt(i, dummy.matrix);
      }
      vents.instanceMatrix.needsUpdate = true;
      wheel.add(vents);
      instances.push(vents);
    }
  }
  group.userData = {
    units: 'meters', front: '+Z', wheelAxleAxis: 'X', bodyColorParameter: 'bodyColor'
  };
  return {
    root: group,
    dispose: () => {
      instances.forEach(m => m.dispose());
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}
