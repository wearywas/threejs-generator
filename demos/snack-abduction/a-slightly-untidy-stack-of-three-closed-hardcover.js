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
  "prompt": "A slightly untidy stack of three closed hardcover books, with teal, coral, and cream covers, visible page blocks, and one ribbon bookmark. Each book is rotated slightly relative to the others. No lettering. This should form a broad, readable obstacle on a miniature desktop.",
  "family": "general",
  "spec": null,
  "schema": null,
  "seed": 2277901400,
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
  group.name = "Three untidy hardcover books";
  const geometries = new Set();
  const materials = new Set();
  const ownedTextures = [];
  let state = (Number(seed) || 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  function material(color, options = {}) {
    const m = new THREE.MeshStandardMaterial({
      color, roughness: 0.78, ...options
    });
    materials.add(m);
    return m;
  }
  function mesh(geometry, mat, parent, name, x, y, z) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.name = name;
    object.position.set(x || 0, y || 0, z || 0);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  // Fine, irregular horizontal lines belong to the page-block surface itself.
  const canvas = new OffscreenCanvas(512, 256);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0e5cc";
  ctx.fillRect(0, 0, 512, 256);
  for (let y = 2; y < 256; y += 3 + Math.floor(random() * 4)) {
    ctx.fillStyle = `rgba(121,100,70,${0.12 + random() * 0.16})`;
    ctx.fillRect(0, y, 512, 1);
    if (random() > 0.5) {
      ctx.fillStyle = "rgba(255,255,245,0.55)";
      ctx.fillRect(0, y + 1, 512, 1);
    }
  }
  const pageTexture = new THREE.CanvasTexture(canvas);
  pageTexture.colorSpace = THREE.SRGBColorSpace;
  ownedTextures.push(pageTexture);

  const pages = material(0xffffff, { map: pageTexture, roughness: 0.95 });
  const paperTop = material(0xf0e5cc, { roughness: 0.95 });
  const ribbonMat = material(0xc59636, { roughness: 0.63 });
  const coverColors = [0x247d80, 0xeadcba, 0xd97468];
  const edgeColors = [0x19575c, 0xc2af88, 0xa94e49];

  function boardGeometry(width, depth, thickness) {
    const r = 0.055, x = -width / 2, z = -depth / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + r, z);
    shape.lineTo(x + width - r, z);
    shape.quadraticCurveTo(x + width, z, x + width, z + r);
    shape.lineTo(x + width, z + depth - r);
    shape.quadraticCurveTo(x + width, z + depth, x + width - r, z + depth);
    shape.lineTo(x + r, z + depth);
    shape.quadraticCurveTo(x, z + depth, x, z + depth - r);
    shape.lineTo(x, z + r);
    shape.quadraticCurveTo(x, z, x + r, z);
    const bevel = 0.008;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 4,
      steps: 1
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, bevel, 0);
    return geometry;
  }

  const specs = [
    { w: 3.35, d: 2.22, h: 0.49, angle: -0.045, x: -0.015, z: 0 },
    { w: 3.16, d: 2.12, h: 0.44, angle: 0.065, x: 0.055, z: -0.025 },
    { w: 3.24, d: 2.16, h: 0.46, angle: -0.09, x: -0.055, z: 0.035 }
  ];
  let base = 0;
  const books = [];
  specs.forEach((s, i) => {
    const book = new THREE.Group();
    book.name = ["Teal bottom book", "Cream middle book", "Coral top book"][i];
    book.position.set(s.x, base, s.z);
    book.rotation.y = s.angle;
    group.add(book);
    books.push(book);

    const cover = material(coverColors[i]);
    const binding = material(edgeColors[i]);
    const t = 0.062;
    const board = boardGeometry(s.w, s.d, t);
    mesh(board, cover, book, "Lower hardcover board", 0, 0, 0);
    mesh(board, cover, book, "Upper hardcover board", 0, s.h - t, 0);

    const pageWidth = s.w - 0.25;
    const pageDepth = s.d - 0.15;
    const pageHeight = s.h - 2 * t - 0.018;
    mesh(
      new THREE.BoxGeometry(pageWidth, pageHeight, pageDepth),
      [pages, pages, paperTop, paperTop, pages, pages],
      book, "Visible ivory page block", 0.035, s.h / 2, 0
    );

    // A rounded solid spine joins the boards and overlaps the hidden page edge.
    mesh(
      boardGeometry(0.17, s.d - 0.014, s.h - 0.08),
      cover, book, "Clothbound spine",
      -s.w / 2 + 0.072, 0.04, 0
    );

    // Narrow hinge channels sit above the cover, away from the page surfaces.
    for (const y of [0.007, s.h - 0.007]) {
      mesh(
        new THREE.BoxGeometry(0.018, 0.018, s.d - 0.13),
        binding, book, "Inset binding hinge",
        -s.w / 2 + 0.205, y, 0
      );
    }
    base += s.h;
  });

  // One ochre ribbon emerges from the upper book and bends over its fore-edge.
  const top = books[2], s = specs[2];
  const edge = s.d / 2;
  const path = [
    [edge - 0.19, s.h - 0.115],
    [edge - 0.06, s.h - 0.115],
    [edge + 0.035, s.h - 0.128],
    [edge + 0.105, s.h - 0.17],
    [edge + 0.16, s.h - 0.245],
    [edge + 0.21, s.h - 0.32],
    [edge + 0.30, s.h - 0.35],
    [edge + 0.39, s.h - 0.33]
  ];
  const positions = [], indices = [];
  const rows = path.length, columns = 3, layer = rows * columns;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        const notch = i === rows - 1 && j === 1 ? 0.055 : 0;
        positions.push(
          0.61 + (j - 1) * 0.064,
          path[i][1] + (side === 0 ? 0.006 : -0.006),
          path[i][0] - notch
        );
      }
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < columns - 1; j++) {
      const a = i * columns + j, b = a + 1, c = a + columns, d = c + 1;
      indices.push(a, c, b, b, c, d);
      indices.push(a + layer, b + layer, c + layer, b + layer, d + layer, c + layer);
    }
  }
  const perimeter = [];
  for (let j = 0; j < columns; j++) perimeter.push(j);
  for (let i = 1; i < rows; i++) perimeter.push(i * columns + columns - 1);
  for (let j = columns - 2; j >= 0; j--) perimeter.push((rows - 1) * columns + j);
  for (let i = rows - 2; i > 0; i--) perimeter.push(i * columns);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, b, a + layer, b, b + layer, a + layer);
  }
  const ribbonGeometry = new THREE.BufferGeometry();
  ribbonGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  ribbonGeometry.setIndex(indices);
  ribbonGeometry.computeVertexNormals();
  mesh(ribbonGeometry, ribbonMat, top, "Single fork-ended ribbon bookmark");

  return {
    root: group,
    dispose: () => {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      ownedTextures.forEach(t => t.dispose());
    }
  };
}
