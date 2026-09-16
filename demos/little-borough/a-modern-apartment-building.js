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
  "prompt": "A modern apartment building.",
  "family": "smallBuilding",
  "spec": null,
  "schema": {
    "floorCount": {
      "type": "integer",
      "min": 1,
      "max": 10,
      "step": 1,
      "default": 5,
      "label": "Number of Floors",
      "description": "Total floors including the ground-floor lobby. Adds real floor plates, walls, windows and upper-floor balconies; the roof and terrace follow the height. The original asset is an exterior shell with no interior room partitions, so rooms per floor are not adjustable."
    },
    "windowOpacity": {
      "type": "number",
      "min": 0,
      "max": 1,
      "step": 0.01,
      "default": 1,
      "label": "Window Opacity",
      "description": "1 preserves the original opaque glazing; 0 hides the glazing and its dark backing. Affects windows and entrance glazing, not balcony railings. Transparent windows reveal an unfurnished shell, not modeled rooms."
    },
    "facadeColor": {
      "type": "color",
      "default": "#e9e7df",
      "label": "Facade Color",
      "description": "Light exterior walls, floor trim, balcony slabs and roof parapets."
    },
    "accentColor": {
      "type": "color",
      "default": "#303c43",
      "label": "Dark Accent Color",
      "description": "Central facade panels, entrance canopy, sign background, rooftop enclosure and balcony planters."
    },
    "woodColor": {
      "type": "color",
      "default": "#b97948",
      "label": "Cedar Panel Color",
      "description": "Vertical cedar accent panel and rooftop decking. Lighter wood slats and furniture retain their original contrasting finish."
    },
    "windowColor": {
      "type": "color",
      "default": "#507f92",
      "label": "Primary Window Tint",
      "description": "Tint of the darker seeded glazing variation; visible when window opacity is above zero."
    },
    "windowLightColor": {
      "type": "color",
      "default": "#739eac",
      "label": "Secondary Window Tint",
      "description": "Tint of the lighter seeded glazing variation; visible when window opacity is above zero."
    },
    "scale": {
      "type": "number",
      "min": 0.25,
      "max": 3,
      "step": 0.05,
      "default": 1,
      "label": "Overall Scale",
      "description": "Uniform scale of the complete building and landscaped base, independent of the structural floor count."
    }
  },
  "seed": 94918309,
  "params": {
    "floorCount": 7,
    "windowOpacity": 0.38,
    "facadeColor": "#e9e7df",
    "accentColor": "#303c43",
    "woodColor": "#b97948",
    "windowColor": "#507f92",
    "windowLightColor": "#739eac",
    "scale": 1
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
  const floorCount = Math.max(1, Math.min(10, Math.round(Number(params.floorCount ?? 5)) || 5));
  const windowOpacity = Math.max(0, Math.min(1, Number(params.windowOpacity ?? 1)));
  const facadeColor = params.facadeColor ?? '#e9e7df';
  const accentColor = params.accentColor ?? '#303c43';
  const woodColor = params.woodColor ?? '#b97948';
  const windowColor = params.windowColor ?? '#507f92';
  const windowLightColor = params.windowLightColor ?? '#739eac';
  const assetScale = Number(params.scale ?? 1);
  const group = new THREE.Group();
  group.name = 'Park 24 — Modern Apartments';
  let state = (Number(seed) || 1) >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const geometries = new Set(), materials = new Set(), ownedTextures = new Set();
  const batches = new Map();
  const geometry = g => { geometries.add(g); return g; };
  function material(color, roughness = 0.75, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m);
    return m;
  }
  const ivory = material(facadeColor);
  const concrete = material(0xb4b8b6, 0.9);
  const charcoal = material(accentColor);
  const metal = material(0x26363d, 0.4, 0.55);
  const cedar = material(woodColor);
  const cedarLight = material(0xcf9561);
  const paving = material(0xd0cdc3);
  const asphalt = material(0x697275);
  const glass = material(windowColor, 0.22, 0.32);
  const glassLight = material(windowLightColor, 0.25, 0.25);
  const shadow = material(0x172932);
  // Fade the original opaque backing as well as the glass so transparency
  // actually reveals the building shell rather than an opaque dark rectangle.
  for (const m of [glass, glassLight, shadow]) {
    m.opacity = windowOpacity;
    m.transparent = windowOpacity < 1;
    m.depthWrite = windowOpacity === 1;
  }
  const blinds = material(0xb8b8ac);
  const soil = material(0x3f3930);
  const green = material(0x517652);
  const leafLight = material(0x719059);
  const railGlass = material(0x9fc8cc, 0.17, 0.12);
  railGlass.transparent = true;
  railGlass.opacity = 0.37;
  railGlass.depthWrite = false;
  const lamp = material(0xffe2ac);
  lamp.emissive.set(0xffcc83);
  lamp.emissiveIntensity = 0.55;

  const unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
  const dummy = new THREE.Object3D();
  function box(w, h, d, x, y, z, mat, ry = 0) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ w, h, d, x, y, z, ry });
  }

  box(12.2, 0.18, 10.6, 0, 0.09, 0, charcoal);
  box(12.12, 0.09, 10.52, 0, 0.225, 0, paving);
  box(10.0, 0.18, 7.1, 0, 0.36, 0, concrete);
  for (let i = 0; i < 11; i++) {
    box(0.018, 0.008, 1.8, -5.5 + i * 1.1, 0.274, 4.3, concrete);
  }
  box(11.9, 0.008, 0.018, 0, 0.274, 4.6, concrete);
  box(2.8, 0.09, 0.75, 0, 0.315, 3.85, concrete);
  box(2.6, 0.09, 0.5, 0, 0.405, 3.6, paving);

  const W = 9.6, D = 6.8, baseY = 0.45;
  const groundHeight = 3.0, floorHeight = 2.7;
  const upperFloorCount = floorCount - 1;
  const roofY = baseY + groundHeight + upperFloorCount * floorHeight;

  function facade(cx, cz, angle, width, bays, level, height, isFront, ground) {
    const c = Math.cos(angle), s = Math.sin(angle);
    function part(w, h, d, x, y, z, mat) {
      box(w, h, d, cx + c * x + s * z, level + y, cz - s * x + c * z, mat, angle);
    }
    const bw = width / bays;
    for (let i = 0; i < bays; i++) {
      const x = -width / 2 + bw * (i + 0.5);
      const entry = ground && isFront && i === 1;
      const balcony = !ground && isFront && i !== 1;
      const openingW = entry ? 2.36 : balcony ? 2.44 : ground ? bw - 0.58 : bw - 0.95;
      const sill = entry ? 0.02 : balcony ? 0.2 : ground ? 0.3 : 0.67;
      const top = height - 0.35;
      const openingH = top - sill;
      const side = (bw - openingW) / 2;
      const wall = isFront && i === 1 && !ground ? charcoal : ivory;
      part(bw, sill, 0.22, x, sill / 2, 0, wall);
      part(bw, height - top, 0.22, x, (height + top) / 2, 0, wall);
      for (const sign of [-1, 1]) {
        part(side, openingH, 0.22, x + sign * (openingW + side) / 2,
          sill + openingH / 2, 0, wall);
      }
      part(openingW, openingH, 0.045, x, sill + openingH / 2, -0.075, shadow);
      part(openingW - 0.12, openingH - 0.12, 0.035, x, sill + openingH / 2,
        -0.025, random() > 0.4 ? glass : glassLight);
      for (const sign of [-1, 1]) {
        part(0.065, openingH, 0.09, x + sign * (openingW / 2 - 0.033),
          sill + openingH / 2, 0.02, metal);
      }
      for (const y of [sill + 0.035, top - 0.035]) {
        part(openingW, 0.07, 0.09, x, y, 0.025, metal);
      }
      part(0.055, openingH, 0.095, x, sill + openingH / 2, 0.028, metal);
      if (!entry && !balcony) {
        part(openingW + 0.2, 0.09, 0.34, x, sill - 0.025, 0.06, concrete);
        if (!ground && random() > 0.55) {
          const h = 0.24 + random() * 0.43;
          part(openingW * 0.45, h, 0.025, x - openingW * 0.25, top - h / 2 - 0.05, 0.005, blinds);
        }
      }
      if (entry) {
        for (const dx of [-0.12, 0.12]) {
          part(0.027, 0.46, 0.065, x + dx, 1.25, 0.115, cedarLight);
        }
        part(openingW, 0.055, 0.1, x, 2.15, 0.04, metal);
      }
      if (ground && !entry) {
        part(openingW, 0.05, 0.09, x, 1.95, 0.035, metal);
      }
    }
  }

  for (let floor = 0; floor < floorCount; floor++) {
    const y = floor === 0 ? baseY : baseY + groundHeight + (floor - 1) * floorHeight;
    const h = floor === 0 ? groundHeight : floorHeight;
    box(W, 0.17, D, 0, y + 0.04, 0, concrete);
    facade(0, D / 2, 0, W, 3, y, h, true, floor === 0);
    facade(0, -D / 2, Math.PI, W, 3, y, h, false, floor === 0);
    facade(W / 2, 0, Math.PI / 2, D, 3, y, h, false, floor === 0);
    facade(-W / 2, 0, -Math.PI / 2, D, 3, y, h, false, floor === 0);
    // Project the trim 0.04 beyond the facade's 0.11 half-thickness.
    // Equal outer face depths cause z-fighting even with different box centers.
    box(W + 0.30, 0.17, D + 0.30, 0, y + h - 0.045, 0, ivory);
  }

  // Keep the cedar accent to the right of the sign (x=1.35) and window sills.
  // Narrow both the backing and slats, with 0.04m of sign clearance at scale 1.
  box(0.20, roofY - baseY, 0.12, 1.49, (roofY + baseY) / 2, 3.55, cedar);
  for (let i = 0; i < 3; i++) {
    box(0.035, roofY - baseY, 0.055, 1.415 + i * 0.075,
      (roofY + baseY) / 2, 3.635, cedarLight);
  }

  const planterPositions = [];
  for (let floor = 0; floor < upperFloorCount; floor++) {
    const y = baseY + groundHeight + floor * floorHeight;
    for (const x of [-3.2, 3.2]) {
      box(3.04, 0.2, 1.38, x, y + 0.025, 3.94, ivory);
      box(2.82, 0.035, 1.19, x, y + 0.145, 3.93, paving);
      box(2.91, 0.035, 0.055, x, y + 1.2, 4.58, metal);
      box(2.86, 0.88, 0.026, x, y + 0.705, 4.575, railGlass);
      box(2.91, 0.04, 0.05, x, y + 0.25, 4.575, metal);
      for (const sign of [-1, 1]) {
        box(0.045, 1.06, 0.045, x + sign * 1.44, y + 0.68, 4.58, metal);
        box(0.035, 0.88, 1.13, x + sign * 1.44, y + 0.705, 3.995, railGlass);
        box(0.055, 0.035, 1.2, x + sign * 1.44, y + 1.2, 3.99, metal);
        box(0.045, 1.06, 0.045, x + sign * 1.44, y + 0.68, 3.42, metal);
      }
      box(0.035, 0.98, 0.045, x, y + 0.71, 4.59, metal);
      if ((floor + (x > 0 ? 1 : 0)) % 2 === 0) {
        const px = x + (x > 0 ? 0.97 : -0.97);
        box(0.65, 0.35, 0.4, px, y + 0.325, 4.13, charcoal);
        box(0.57, 0.025, 0.32, px, y + 0.506, 4.13, soil);
        planterPositions.push([px, y + 0.51, 4.13, 0.26]);
      }
    }
  }

  box(3.3, 0.16, 1.05, 0, 3.14, 3.77, charcoal);
  box(2.5, 0.025, 0.07, 0, 3.045, 4.13, lamp);
  for (const x of [-1.43, 1.73]) {
    box(0.14, 0.45, 0.13, x, 2.13, 3.56, metal);
    box(0.085, 0.31, 0.02, x, 2.13, 3.637, lamp);
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(512, 128);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + charcoal.color.getHexString(THREE.SRGBColorSpace);
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#f1e9d6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 40px sans-serif';
    ctx.fillText('24  /  PARK RESIDENCES', 256, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    ownedTextures.add(texture);
    const signMat = new THREE.MeshBasicMaterial({ map: texture });
    materials.add(signMat);
    const sign = new THREE.Mesh(geometry(new THREE.PlaneGeometry(2.7, 0.675)), signMat);
    sign.position.set(0, 2.69, 3.525);
    group.add(sign);
  }

  box(9.94, 0.22, 7.14, 0, roofY + 0.05, 0, ivory);
  box(9.45, 0.04, 6.65, 0, roofY + 0.18, 0, asphalt);
  for (const x of [-4.77, 4.77]) {
    box(0.17, 0.62, 6.87, x, roofY + 0.42, 0, ivory);
    box(0.23, 0.06, 6.95, x, roofY + 0.76, 0, metal);
  }
  for (const z of [-3.36, 3.36]) {
    box(9.63, 0.62, 0.17, 0, roofY + 0.42, z, ivory);
    box(9.77, 0.06, 0.23, 0, roofY + 0.76, z, metal);
  }
  box(2.5, 2.0, 2.25, -2.6, roofY + 1.2, -1.65, charcoal);
  box(2.7, 0.13, 2.45, -2.6, roofY + 2.23, -1.65, ivory);
  box(0.85, 1.72, 0.04, -2.6, roofY + 1.06, -0.5, metal);
  box(0.045, 0.23, 0.04, -2.31, roofY + 1.08, -0.465, cedarLight);
  box(3.8, 0.06, 3.0, 1.45, roofY + 0.23, 0.15, cedar);
  for (let i = 0; i < 15; i++) {
    box(0.018, 0.009, 2.98, -0.34 + i * 0.25, roofY + 0.265, 0.15, charcoal);
  }
  for (const x of [-0.35, 3.25]) {
    for (const z of [-1.23, 1.53]) {
      box(0.085, 2.05, 0.085, x, roofY + 1.28, z, metal);
    }
    box(0.12, 0.16, 3.02, x, roofY + 2.28, 0.15, metal);
  }
  for (let i = 0; i < 11; i++) {
    box(3.86, 0.13, 0.115, 1.45, roofY + 2.39, -1.28 + i * 0.285, cedarLight);
  }
  box(2.2, 0.12, 0.57, 1.45, roofY + 0.7, -0.9, cedarLight);
  for (const x of [0.59, 2.31]) {
    box(0.12, 0.43, 0.46, x, roofY + 0.455, -0.9, metal);
  }
  for (const x of [-3.55, 3.6]) {
    box(1.25, 0.46, 0.64, x, roofY + 0.43, 2.5, concrete);
    box(1.13, 0.025, 0.52, x, roofY + 0.67, 2.5, soil);
    planterPositions.push([x - 0.3, roofY + 0.67, 2.5, 0.3]);
    planterPositions.push([x + 0.3, roofY + 0.67, 2.5, 0.3]);
  }

  for (const x of [-3.8, 3.8]) {
    box(2.4, 0.48, 0.67, x, 0.51, 4.5, concrete);
    box(2.24, 0.035, 0.52, x, 0.76, 4.5, soil);
    for (let i = 0; i < 4; i++) {
      planterPositions.push([x - 0.84 + i * 0.56, 0.78, 4.5, 0.31]);
    }
  }
  const foliageGeometry = geometry(new THREE.SphereGeometry(1, 8, 5));
  const foliage = new THREE.InstancedMesh(foliageGeometry, green, planterPositions.length * 2);
  let index = 0;
  for (const [x, y, z, r] of planterPositions) {
    for (let j = 0; j < 2; j++) {
      dummy.position.set(x + (j - 0.5) * r * 0.7, y + r * 0.54, z);
      dummy.rotation.set(0, random() * Math.PI, 0);
      dummy.scale.set(r * 0.85, r * (0.85 + random() * 0.25), r * 0.8);
      dummy.updateMatrix();
      foliage.setMatrixAt(index, dummy.matrix);
      foliage.setColorAt(index++, j ? leafLight.color : green.color);
    }
  }
  foliage.instanceMatrix.needsUpdate = true;
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  group.add(foliage);

  for (const [mat, entries] of batches) {
    const instances = new THREE.InstancedMesh(unitBox, mat, entries.length);
    entries.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.ry, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = mat !== railGlass && !(windowOpacity < 1 && (mat === glass || mat === glassLight || mat === shadow));
    instances.receiveShadow = true;
    group.add(instances);
  }
  if (Number.isFinite(assetScale) && assetScale > 0) group.scale.setScalar(assetScale);

  return {
    root: group,
    dispose: () => {
      group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      ownedTextures.forEach(t => t.dispose());
    }
  };
}
