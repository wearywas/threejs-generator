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
  "prompt": "A coffee mug with a colorful emblem sticker.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 4090235785,
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
  group.name = "Happy Brew Coffee Mug";
  params = params || {};
  const geometries = [];
  const materials = [];
  const ownedTextures = [];

  function mesh(geometry, material) {
    geometries.push(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }

  const ceramic = new THREE.MeshStandardMaterial({
    color: params.color || "#78bdb7",
    roughness: 0.23,
    metalness: 0
  });
  materials.push(ceramic);

  // Continuous profile includes the underside, rounded lip, and hollow interior.
  const profile = [
    [0, 0], [0.33, 0], [0.375, 0.014], [0.393, 0.048],
    [0.40, 0.14], [0.445, 0.94], [0.448, 0.995],
    [0.445, 1.019], [0.434, 1.034], [0.421, 1.034],
    [0.410, 1.022], [0.405, 0.994], [0.362, 0.20],
    [0.350, 0.16], [0.325, 0.14], [0, 0.14]
  ].map(p => new THREE.Vector2(p[0], p[1]));
  mesh(new THREE.LatheGeometry(profile, 64), ceramic).name = "Hollow glazed ceramic cup";

  const handlePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.405, 0.83, 0),
    new THREE.Vector3(0.615, 0.865, 0),
    new THREE.Vector3(0.785, 0.735, 0),
    new THREE.Vector3(0.800, 0.51, 0),
    new THREE.Vector3(0.665, 0.305, 0),
    new THREE.Vector3(0.394, 0.245, 0)
  ]);
  mesh(new THREE.TubeGeometry(handlePath, 48, 12, 10, false), ceramic);
  // Set the handle's tube thickness independently of its path.
  const oversizedHandle = group.children[group.children.length - 1];
  const oldHandleGeometry = oversizedHandle.geometry;
  geometries.splice(geometries.indexOf(oldHandleGeometry), 1);
  oldHandleGeometry.dispose();
  oversizedHandle.geometry = new THREE.TubeGeometry(handlePath, 48, 0.066, 12, false);
  geometries.push(oversizedHandle.geometry);
  oversizedHandle.name = "Rounded loop handle";

  function drawEmblem(ctx, w, h) {
    ctx.scale(w / 512, h / 512);
    ctx.clearRect(0, 0, 512, 512);

    function circle(x, y, r, color) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    circle(256, 256, 254, "#fff5d9");
    ctx.beginPath();
    ctx.arc(256, 256, 235, 0, Math.PI * 2);
    ctx.strokeStyle = "#193e4b";
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(256, 244, 166, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#f7af8d";
    ctx.fillRect(75, 70, 365, 345);
    circle(270, 203, 79, "#ffdb55");

    ctx.strokeStyle = "#fff0b5";
    ctx.lineWidth = 6;
    for (let i = 0; i < 11; i++) {
      const a = i * Math.PI * 2 / 11;
      ctx.beginPath();
      ctx.moveTo(270 + Math.cos(a) * 91, 203 + Math.sin(a) * 91);
      ctx.lineTo(270 + Math.cos(a) * 107, 203 + Math.sin(a) * 107);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(60, 325);
    ctx.lineTo(158, 205);
    ctx.lineTo(238, 292);
    ctx.lineTo(348, 219);
    ctx.lineTo(457, 340);
    ctx.lineTo(457, 430);
    ctx.lineTo(60, 430);
    ctx.fillStyle = "#378c91";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(63, 364);
    ctx.bezierCurveTo(164, 268, 242, 389, 333, 308);
    ctx.bezierCurveTo(386, 277, 421, 327, 450, 327);
    ctx.lineTo(450, 435);
    ctx.lineTo(63, 435);
    ctx.fillStyle = "#204e60";
    ctx.fill();

    // A tiny cream coffee cup nestled in the landscape.
    ctx.strokeStyle = "#fff5d9";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(289, 334, 19, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = "#fff5d9";
    ctx.beginPath();
    ctx.moveTo(221, 314);
    ctx.lineTo(285, 314);
    ctx.lineTo(281, 351);
    ctx.quadraticCurveTo(253, 372, 225, 351);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(241 + i * 20, 301);
      ctx.bezierCurveTo(229 + i * 20, 290, 253 + i * 20, 280, 243 + i * 20, 269);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "#193e4b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 39px sans-serif";
    ctx.fillText("BREW HAPPY", 256, 435);
    circle(130, 105, 6, "#e9705b");
    circle(382, 105, 6, "#e9705b");
  }

  let emblemTexture;
  if (addons && addons.textures && addons.textures.createCanvasTexture) {
    emblemTexture = addons.textures.createCanvasTexture(512, 512, drawEmblem);
  } else {
    const canvas = new OffscreenCanvas(512, 512);
    drawEmblem(canvas.getContext("2d"), 512, 512);
    emblemTexture = new THREE.CanvasTexture(canvas);
  }
  emblemTexture.colorSpace = THREE.SRGBColorSpace;
  emblemTexture.anisotropy = 4;
  ownedTextures.push(emblemTexture);

  const stickerMaterial = new THREE.MeshStandardMaterial({
    map: emblemTexture,
    roughness: 0.54,
    metalness: 0,
    transparent: true,
    alphaTest: 0.4
  });
  materials.push(stickerMaterial);

  // The label follows the actual tapered wall with a physical clearance.
  const positions = [], uvs = [], indices = [];
  const segments = 64, rings = 8;
  const labelRadius = 0.263, labelY = 0.56;
  function labelVertex(x, y) {
    const height = labelY + y;
    const wallRadius = 0.40 + (height - 0.14) * 0.045 / 0.80;
    const angle = x / 0.424;
    const radius = wallRadius + 0.002;
    positions.push(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    uvs.push(0.5 + x / (2 * labelRadius), 0.5 + y / (2 * labelRadius));
  }
  labelVertex(0, 0);
  for (let ring = 1; ring <= rings; ring++) {
    for (let i = 0; i < segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      const radius = labelRadius * ring / rings;
      labelVertex(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  for (let i = 0; i < segments; i++) {
    indices.push(0, 1 + i, 1 + (i + 1) % segments);
  }
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segments;
    const outer = inner + segments;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      indices.push(inner + i, outer + i, outer + j);
      indices.push(inner + i, outer + j, inner + j);
    }
  }
  const labelGeometry = new THREE.BufferGeometry();
  labelGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  labelGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  labelGeometry.setIndex(indices);
  labelGeometry.computeVertexNormals();
  mesh(labelGeometry, stickerMaterial).name = "Colorful sunrise emblem sticker";

  const scale = Number.isFinite(params.scale) ? Math.max(0.1, Math.min(10, params.scale)) : 1;
  group.scale.setScalar(scale);

  return {
    root: group,
    dispose: () => {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      ownedTextures.forEach(texture => texture.dispose());
    }
  };
}
