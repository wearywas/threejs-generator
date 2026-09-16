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
  "prompt": "A simple hatchback car. Face the front toward positive Z. Keep the four wheels as separately named groups, with each group's origin at its axle center. Use a separately named material called ‘bodyPaint’ for the painted body panels, and expose a bodyColor parameter so copies can have different colors. No logos, lettering, driver, or surrounding scene.",
  "family": "tower",
  "spec": null,
  "schema": {
    "bodyColor": {
      "type": "color",
      "default": "#287fac",
      "label": "Body Color",
      "description": "Color of the named bodyPaint material shared by the body, roof, sills, and mirror housings."
    },
    "paintRoughness": {
      "type": "number",
      "min": 0.05,
      "max": 0.9,
      "step": 0.01,
      "default": 0.3,
      "label": "Paint Roughness",
      "description": "Lower values give glossy paint; higher values give a matte finish."
    },
    "paintMetalness": {
      "type": "number",
      "min": 0,
      "max": 1,
      "step": 0.01,
      "default": 0.35,
      "label": "Paint Metalness",
      "description": "Metallic response of all painted panels."
    },
    "glazingColor": {
      "type": "color",
      "default": "#172e3b",
      "label": "Glazing Color",
      "description": "Color of the opaque tinted side windows, windscreen, and rear hatch glazing."
    },
    "trimColor": {
      "type": "color",
      "default": "#252a30",
      "label": "Trim Color",
      "description": "Color of bumpers, intake, pillars, panel seams, mirror stalks, underbody, and recessed wheel faces."
    },
    "alloyColor": {
      "type": "color",
      "default": "#b7c1ca",
      "label": "Alloy Color",
      "description": "Color of wheel rims, spokes, center caps, door handles, and mirror insets."
    },
    "spokeCount": {
      "type": "integer",
      "min": 3,
      "max": 10,
      "step": 1,
      "default": 5,
      "label": "Spokes per Wheel",
      "description": "Generates this many evenly spaced alloy spokes on each of the four wheels."
    },
    "size": {
      "type": "number",
      "min": 0.5,
      "max": 2,
      "step": 0.01,
      "default": 1,
      "label": "Overall Scale",
      "description": "Uniformly scales the complete car, preserving clearances, ground contact, and the four separately named wheel groups with axle-centered origins."
    }
  },
  "seed": 3160505829,
  "params": {
    "bodyColor": "#287fac",
    "paintRoughness": 0.3,
    "paintMetalness": 0.35,
    "glazingColor": "#172e3b",
    "trimColor": "#252a30",
    "alloyColor": "#b7c1ca",
    "spokeCount": 5,
    "size": 1
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
  const bodyColor = params.bodyColor ?? '#287fac';
  const glazingColor = params.glazingColor ?? '#172e3b';
  const trimColor = params.trimColor ?? '#252a30';
  const alloyColor = params.alloyColor ?? '#b7c1ca';
  const paintRoughness = Math.max(0.05, Math.min(0.9, params.paintRoughness ?? 0.3));
  const paintMetalness = Math.max(0, Math.min(1, params.paintMetalness ?? 0.35));
  const spokeCount = Math.max(3, Math.min(10, Math.round(params.spokeCount ?? 5)));
  const size = Math.max(0.5, Math.min(2, params.size ?? 1));
  const group = new THREE.Group();
  group.name = 'Hatchback';
  group.scale.setScalar(size);
  const geometries = new Set();
  const materials = new Set();

  function material(name, color, roughness, metalness) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name;
    materials.add(m);
    return m;
  }

  const paint = material('bodyPaint', bodyColor, paintRoughness, paintMetalness);
  const glass = material('Tinted glazing', glazingColor, 0.19, 0.28);
  glass.side = THREE.DoubleSide;
  const rubber = material('Tire rubber', '#202125', 0.93, 0);
  const trim = material('Charcoal trim', trimColor, 0.65, 0.08);
  const alloy = material('Satin alloy', alloyColor, 0.28, 0.72);
  const headlight = material('Headlamp lenses', '#e5f5ff', 0.2, 0.18);
  const taillight = material('Red tail lenses', '#b81d32', 0.26, 0.1);
  const amber = material('Amber indicators', '#edaa37', 0.3, 0.1);

  function mesh(name, geometry, mat, parent, x = 0, y = 0, z = 0) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.name = name;
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    (parent || group).add(object);
    return object;
  }

  function box(name, w, h, d, mat, x, y, z, parent) {
    return mesh(name, new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
  }

  function polygon(name, points, mat) {
    const geo = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 1; i < points.length - 1; i++) {
      vertices.push(...points[0], ...points[i], ...points[i + 1]);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return mesh(name, geo, mat);
  }

  const profile = new THREE.Shape();
  profile.moveTo(-1.96, 0.46);
  profile.lineTo(-1.98, 0.86);
  profile.lineTo(-1.68, 1.075);
  profile.lineTo(0.73, 1.06);
  profile.lineTo(1.94, 0.9);
  profile.lineTo(2.0, 0.49);
  profile.lineTo(1.96, 0.46);
  const archRadius = 0.435;
  const axleY = 0.355;
  const angle = Math.asin((0.46 - axleY) / archRadius);
  for (const axleZ of [1.22, -1.22]) {
    profile.lineTo(axleZ + archRadius * Math.cos(angle), 0.46);
    profile.absarc(axleZ, axleY, archRadius, angle, Math.PI - angle, false);
  }
  profile.lineTo(-1.96, 0.46);
  profile.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.7,
    bevelEnabled: false,
    curveSegments: 14,
    steps: 1
  });
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate(0.85, 0, 0);
  mesh('Painted lower body with wheel arches', bodyGeo, paint);
  box('Recessed underbody', 1.36, 0.14, 3.25, trim, 0, 0.49, 0);

  const vertices = [
    [-0.8, 1.035, 0.78], [0.8, 1.035, 0.78],
    [-0.65, 1.67, -0.02], [0.65, 1.67, -0.02],
    [-0.65, 1.67, -1.08], [0.65, 1.67, -1.08],
    [-0.8, 1.035, -1.70], [0.8, 1.035, -1.70]
  ];
  const cabinGeo = new THREE.BufferGeometry();
  cabinGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  cabinGeo.setIndex([
    0, 1, 3, 0, 3, 2,
    2, 3, 5, 2, 5, 4,
    4, 5, 7, 4, 7, 6,
    6, 7, 1, 6, 1, 0,
    0, 2, 4, 0, 4, 6,
    1, 7, 5, 1, 5, 3
  ]);
  cabinGeo.computeVertexNormals();
  const flatCabin = cabinGeo.toNonIndexed();
  cabinGeo.dispose();
  flatCabin.computeVertexNormals();
  mesh('Painted roof and pillars', flatCabin, paint);

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'Left' : 'Right';
    function sideWindow(name, yz) {
      return polygon(sideName + ' ' + name, yz.map(([z, y]) => [
        side * (0.8 - (y - 1.035) * 0.15 / 0.635 + 0.009), y, z
      ]), glass);
    }
    sideWindow('front side window', [
      [-0.53, 1.13], [0.59, 1.13], [-0.07, 1.585], [-0.53, 1.585]
    ]);
    sideWindow('rear side window', [
      [-1.53, 1.13], [-0.63, 1.13], [-0.63, 1.585], [-1.08, 1.585]
    ]);
    sideWindow('B pillar', [
      [-0.625, 1.12], [-0.535, 1.12], [-0.535, 1.6], [-0.625, 1.6]
    ]).material = trim;

    box(sideName + ' front door handle', 0.029, 0.036, 0.19, alloy, side * 0.86, 1.002, -0.37);
    box(sideName + ' rear door handle', 0.029, 0.036, 0.16, alloy, side * 0.86, 1.002, -1.34);
    box(sideName + ' lower sill', 0.045, 0.09, 1.55, paint, side * 0.856, 0.535, 0);
    box(sideName + ' mirror stalk', 0.16, 0.047, 0.075, trim, side * 0.84, 1.16, 0.47);
    box(sideName + ' painted mirror housing', 0.21, 0.125, 0.21, paint, side * 0.955, 1.185, 0.48);
    box(sideName + ' mirror inset', 0.162, 0.085, 0.013, alloy, side * 0.963, 1.185, 0.371);
    box(sideName + ' door division', 0.002, 0.35, 0.008, trim, side * 0.851, 0.855, -0.58);
  }

  function windscreenPoint(x, y) {
    return [x, y + 0.006, 0.78 - (y - 1.035) * 0.8 / 0.635 + 0.008];
  }
  polygon('Front windscreen', [
    windscreenPoint(-0.719, 1.115), windscreenPoint(0.719, 1.115),
    windscreenPoint(0.597, 1.606), windscreenPoint(-0.597, 1.606)
  ], glass);

  function rearPoint(x, y) {
    return [x, y + 0.006, -1.7 + (y - 1.035) * 0.62 / 0.635 - 0.008];
  }
  polygon('Rear hatch glazing', [
    rearPoint(0.72, 1.12), rearPoint(-0.72, 1.12),
    rearPoint(-0.595, 1.60), rearPoint(0.595, 1.60)
  ], glass);
  box('Roof rear lip', 1.35, 0.055, 0.17, paint, 0, 1.665, -1.075);

  box('Front lower bumper', 1.47, 0.14, 0.095, trim, 0, 0.565, 1.977);
  box('Front air intake', 0.78, 0.16, 0.052, trim, 0, 0.751, 1.984);
  box('Rear bumper', 1.47, 0.125, 0.09, trim, 0, 0.56, -1.973);
  for (const side of [-1, 1]) {
    box('Front headlamp ' + side, 0.36, 0.145, 0.065, headlight, side * 0.61, 0.808, 1.965);
    box('Front indicator ' + side, 0.065, 0.09, 0.071, amber, side * 0.765, 0.79, 1.968);
    box('Rear tail lamp ' + side, 0.26, 0.18, 0.075, taillight, side * 0.66, 0.806, -1.967);
  }

  const tireGeo = new THREE.TorusGeometry(0.268, 0.087, 10, 32);
  tireGeo.rotateY(Math.PI / 2);
  geometries.add(tireGeo);
  const rimGeo = new THREE.CylinderGeometry(0.239, 0.239, 0.17, 24);
  rimGeo.rotateZ(Math.PI / 2);
  geometries.add(rimGeo);
  const insetGeo = new THREE.CylinderGeometry(0.203, 0.203, 0.012, 24);
  insetGeo.rotateZ(Math.PI / 2);
  geometries.add(insetGeo);
  const hubGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.033, 16);
  hubGeo.rotateZ(Math.PI / 2);
  geometries.add(hubGeo);
  const spokeGeo = new THREE.BoxGeometry(0.021, 0.157, 0.044);
  geometries.add(spokeGeo);
  const instances = [];

  for (const axle of [
    { name: 'Front', z: 1.22 },
    { name: 'Rear', z: -1.22 }
  ]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = 'wheel' + axle.name + (side < 0 ? 'Left' : 'Right');
      wheel.position.set(side * 0.867, axleY, axle.z);
      wheel.userData.axleAxis = 'X';
      group.add(wheel);

      mesh('Tire', tireGeo, rubber, wheel);
      mesh('Alloy rim', rimGeo, alloy, wheel);
      mesh('Recessed wheel face', insetGeo, trim, wheel, side * 0.092, 0, 0);
      mesh('Center cap', hubGeo, alloy, wheel, side * 0.106, 0, 0);

      const spokes = new THREE.InstancedMesh(spokeGeo, alloy, spokeCount);
      spokes.name = spokeCount === 5 ? 'Five alloy spokes' : spokeCount + ' alloy spokes';
      const dummy = new THREE.Object3D();
      for (let i = 0; i < spokeCount; i++) {
        const a = i * Math.PI * 2 / spokeCount;
        dummy.position.set(side * 0.109, Math.cos(a) * 0.13, Math.sin(a) * 0.13);
        dummy.rotation.set(a, 0, 0);
        dummy.updateMatrix();
        spokes.setMatrixAt(i, dummy.matrix);
      }
      spokes.instanceMatrix.needsUpdate = true;
      spokes.castShadow = true;
      wheel.add(spokes);
      instances.push(spokes);
    }
  }

  group.userData = {
    units: 'meters',
    front: '+Z',
    bodyColorParameter: 'bodyColor',
    wheelAxleAxis: 'X'
  };

  return {
    root: group,
    dispose: () => {
      instances.forEach(object => object.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(mat => mat.dispose());
    }
  };
}
