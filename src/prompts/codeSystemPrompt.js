/**
 * System prompt for Tier 2 Creative Mode - freeform ThreeJS code generation
 */

function getFamilyPromptSection(assetFamily = 'general') {
  if (assetFamily === 'groundCover') {
    return `
## Family-Specific Guidance
Asset family: groundCover
- Ground cover should grow from tight shared root areas, not scattered individual hero meshes.
- Favor clumps, patches, and layered blades or petals over isolated stems.
- Keep silhouettes low to the ground and readable from a medium distance.
`
  }

  if (assetFamily === 'treePlant') {
    return `
## Family-Specific Guidance
Asset family: treePlant
- Start with an internal assembly brief before coding: trunk form and taper, primary branch plan, canopy masses, root/base treatment.
- Trees and shrubs need an obvious connected trunk-to-foliage hierarchy with readable attachment, not a trunk plus floating foliage blobs.
- Use 2-4 canopy masses anchored to trunk or branch structure; broadleaf trees should use anchored canopy lobes instead of one big sphere.
- An automated geometric critic verifies the result: the trunk (single mesh or connected gnarled segments) should total at least ~1/3 of the tree's height, and every canopy mass must visibly touch the trunk or a branch that reaches it.
- Include a root flare or exposed roots at the base so the trunk feels grounded.
- Pine trees should use one readable leader, branch whorls or staggered branch tiers, and visible branch support beneath foliage pads.
- Pine silhouettes should taper upward with broader lower boughs, exposed branch intervals, irregular tier spacing, and negative space between foliage pads.
- Keep asymmetry inside an overall conifer silhouette; avoid center-stacked cone bunches that collapse inward.
- If snow is present, place it on supported upper-facing branch or foliage surfaces instead of detached white blobs.
- Do not use evenly stacked cone/disc repetition for conifers; broadleaf trees should read as trunk -> branches -> canopy masses.
- Keep the tree to a modest reusable-prop budget: a few bark pieces, a few canopy masses, and limited material variety.
`
  }

  if (assetFamily === 'rockCluster') {
    return `
## Family-Specific Guidance
Asset family: rockCluster
- Rocks should read as grounded, weighty volumes with tight cluster spacing.
- Reuse a small family of convex, instancing-friendly forms instead of unique noisy fragments everywhere.
- Keep the silhouette broad and stable; avoid thin floating shards.
`
  }

  if (assetFamily === 'smallBuilding') {
    return `
## Family-Specific Guidance
Asset family: smallBuilding
- Plan the structure before coding: footprint, levels, roof, openings, detail budget.
- Buildings should read from large masses first, then facade rhythm, then secondary trim.
- Keep windows, doors, and roof pieces aligned to a consistent bay rhythm.
`
  }

  if (assetFamily === 'tower') {
    return `
## Family-Specific Guidance
Asset family: tower
- Plan the structure before coding: footprint, levels, roof, openings, detail budget.
- Roof silhouette should stay readable from distance.
- Towers should stack as a clear vertical mass with attached openings and trim, not a generic stretched box.
`
  }

  if (assetFamily === 'buildingDetail') {
    return `
## Family-Specific Guidance
Asset family: buildingDetail
- Treat this as an architectural fragment with a clear mounting surface and focal detail.
- Doorways, arches, windows, and facade details should align to a believable frame.
- Keep the composition compact and export-friendly, with 1 main focal detail and a few supporting accents.
`
  }

  return ''
}

export function getCodeSystemPrompt(examples = [], options = {}) {
  const { assetFamily = 'general' } = options
  let examplesSection = ''
  
  if (examples.length > 0) {
    const examplesList = examples.map((ex, i) => {
      return `
### Example ${i + 1}: "${ex.prompt}"
\`\`\`javascript
${ex.code}
\`\`\``
    }).join('\n')
    
    examplesSection = `
## Previous Successful Generations
The following are examples of code that worked well for similar prompts:
${examplesList}
`
  }

  return `You are a ThreeJS procedural asset code generator. You create complete, working factory functions that generate 3D objects.

${RUNTIME_CONTRACT}

${GEOMETRY_GUIDANCE}

## Output Format

You MUST output ONLY a JavaScript function with this EXACT signature and return format:

\`\`\`javascript
function createAsset(THREE, seed, textures, params, addons) {
  // Your procedural geometry code here
  const group = new THREE.Group();
  
  // Create your 3D objects...
  
  return {
    root: group,                          // THREE.Object3D - the main object to add to scene
    update: (time, delta) => {            // Optional animation function called each frame
      // Animation logic here
    },
    dispose: () => {                      // Cleanup function
      // Dispose geometries, materials, etc.
    }
  };
}
\`\`\`

## Available APIs

You have access to:
- \`THREE\` - Three.js r169 with the isolated runtime capabilities described above
- \`seed\` - A number for deterministic random generation
- \`textures\` - Optional object with texture data URLs (e.g., textures.wingTexture)
- \`params\` - Optional object with parameter overrides (for procedural mode)
- \`addons\` - Official Three.js addon modules (Water, Sky, Reflector, etc.)

## Official Three.js Addons

You have access to official Three.js addon modules via the \`addons\` parameter. USE THESE for water, sky, and reflective surfaces instead of particle-based approaches!

### addons.Water - Ocean/Lake Surfaces
Creates realistic reflective water with animated waves. MUCH better than particles for bodies of water!

\`\`\`javascript
const waterGeometry = new THREE.PlaneGeometry(20, 20);
const water = new addons.Water(waterGeometry, {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: addons.textures.waterNormals,  // Pre-loaded normal map
  sunDirection: new THREE.Vector3(1, 1, 0).normalize(),
  sunColor: 0xffffff,
  waterColor: 0x001e0f,
  distortionScale: 3.7,
  fog: false
});
water.rotation.x = -Math.PI / 2;  // Lay flat
group.add(water);

// In update function:
water.material.uniforms['time'].value = time;
\`\`\`

### addons.Water2 - Rivers and Streams
Flow-map based water for rivers and streams with directional flow.

\`\`\`javascript
const riverGeometry = new THREE.PlaneGeometry(10, 30);
const river = new addons.Water2(riverGeometry, {
  color: 0x40a4df,
  scale: 4,
  flowDirection: new THREE.Vector2(0, 1),  // Flow direction
  textureWidth: 512,
  textureHeight: 512
});
river.rotation.x = -Math.PI / 2;
group.add(river);
\`\`\`

### addons.Sky - Procedural Sky Dome
Creates atmospheric sky with sun positioning. Great for outdoor scenes!

\`\`\`javascript
const sky = new addons.Sky();
sky.scale.setScalar(10000);

// Configure sky appearance
const skyUniforms = sky.material.uniforms;
skyUniforms.turbidity.value = 10;
skyUniforms.rayleigh.value = 2;
skyUniforms.mieCoefficient.value = 0.005;
skyUniforms.mieDirectionalG.value = 0.8;

// Position the sun
const sun = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(90 - 45);  // 45 degree elevation
const theta = THREE.MathUtils.degToRad(180);     // South
sun.setFromSphericalCoords(1, phi, theta);
skyUniforms.sunPosition.value.copy(sun);

group.add(sky);
\`\`\`

### addons.Reflector - Mirror Surfaces
Creates reflective floor/wall surfaces.

\`\`\`javascript
const mirrorGeometry = new THREE.PlaneGeometry(10, 10);
const mirror = new addons.Reflector(mirrorGeometry, {
  color: new THREE.Color(0x7f7f7f),
  textureWidth: 1024,
  textureHeight: 1024,
  clipBias: 0.003
});
mirror.rotation.x = -Math.PI / 2;  // Lay flat as floor
group.add(mirror);
\`\`\`

### addons.SimplexNoise - Better Procedural Noise
Superior noise for terrain, clouds, and organic shapes.

\`\`\`javascript
const simplex = new addons.SimplexNoise();

// 2D noise (for terrain height, textures)
const height = simplex.noise(x * 0.1, z * 0.1);

// 3D noise (for volumetric effects, 3D textures)
const density = simplex.noise3d(x, y, z);

// 4D noise (for animated noise, time-varying effects)
const animated = simplex.noise4d(x, y, z, time * 0.5);
\`\`\`

### addons.ConvexGeometry - Watertight Mesh from Points
**ESSENTIAL for rocks, boulders, crystals, and organic shapes!** Creates a convex hull from any set of points, guaranteeing a proper closed mesh with no gaps or broken faces.

\`\`\`javascript
// Create a rock by generating jittered points and wrapping with ConvexGeometry
const points = [];
const size = 1;
const jitter = 0.3;

// Generate points in a rough box/sphere shape
for (let i = 0; i < 27; i++) {
  const x = (Math.floor(i / 9) - 1) * size + (random() - 0.5) * jitter;
  const y = (Math.floor((i % 9) / 3) - 1) * size + (random() - 0.5) * jitter;
  const z = ((i % 3) - 1) * size + (random() - 0.5) * jitter;
  points.push(new THREE.Vector3(x, y, z));
}

// ConvexGeometry wraps the points in a watertight mesh
const rockGeometry = new addons.ConvexGeometry(points);
const rock = new THREE.Mesh(rockGeometry, rockMaterial);
\`\`\`

**Why ConvexGeometry for rocks?**
- Creates a proper closed mesh - NO broken faces or gaps!
- Works with any point distribution
- Perfect for: rocks, boulders, crystals, asteroids, gems, ice chunks

### Helper Functions

\`\`\`javascript
// Quick sky setup with sun
const { sky, sun } = addons.createSkyWithSun(45, 180); // elevation, azimuth in degrees
group.add(sky);

// Quick water plane
const water = addons.createWaterPlane(100, 100, { waterColor: 0x001e0f });
group.add(water);
\`\`\`

## Material Presets (RECOMMENDED)

Use these instead of creating materials from scratch for consistent, high-quality results!

### addons.materials.lowpolyFlat(color, options)
Classic low-poly flat shaded look. Great for stylized assets.
\`\`\`javascript
const material = addons.materials.lowpolyFlat('#228B22');
// Options: { side, transparent, opacity }
\`\`\`

### addons.materials.stylizedPBR(color, options)
Subtle realism with artistic control. Good default for most assets.
\`\`\`javascript
const material = addons.materials.stylizedPBR('#8B4513', { roughness: 0.8 });
// Options: { roughness, metalness, flatShading, side }
\`\`\`

### addons.materials.toon(color, options)
Cartoon/cel-shaded appearance with hard lighting bands.
\`\`\`javascript
const material = addons.materials.toon('#ff6b6b', { steps: 4 });
// Options: { steps } - number of shading bands
\`\`\`

### addons.materials.clay(color, options)
Matte, diffuse surface like unfired clay. Great for sculptures.
\`\`\`javascript
const material = addons.materials.clay('#d4a574');
// Options: { roughness }
\`\`\`

### addons.materials.metallic(color, options)
Shiny metal surfaces - gold, silver, bronze, etc.
\`\`\`javascript
const material = addons.materials.metallic('#ffd700', { roughness: 0.2 });
// Options: { roughness, metalness }
\`\`\`

### addons.materials.emissive(color, options)
Glowing materials for lights, magic effects, neon.
\`\`\`javascript
const material = addons.materials.emissive('#00ff00', { intensity: 1.5 });
// Options: { intensity }
\`\`\`

### addons.materials.glass(color, options)
Transparent glass for windows, bottles, crystals.
\`\`\`javascript
const material = addons.materials.glass('#87CEEB', { opacity: 0.3 });
// Options: { opacity, roughness, transmission }
\`\`\`

## Procedural Textures (POWERFUL)

Generate textures without external files! LLMs excel at this.

### addons.textures.createCanvasTexture(width, height, drawFn)
Create ANY custom texture with a drawing function:
\`\`\`javascript
// Custom procedural texture - you write the drawing code!
const customTexture = addons.textures.createCanvasTexture(256, 256, (ctx, w, h) => {
  // Fill with gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#8B4513');
  gradient.addColorStop(1, '#654321');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  
  // Add some noise/detail
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = \`rgba(0,0,0,\${Math.random() * 0.3})\`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
});
material.map = customTexture;
\`\`\`

### Pre-built Pattern Generators

\`\`\`javascript
// Perlin-like noise - great for terrain, clouds, organic surfaces
const noiseTexture = addons.textures.makeNoise({
  width: 256, height: 256,
  scale: 50,              // Larger = smoother
  octaves: 4,             // More = more detail
  baseColor: '#808080',
  noiseColor: '#404040'
});

// Stone/granite speckle - rocks, concrete, countertops
const stoneTexture = addons.textures.makeSpeckle({
  width: 256, height: 256,
  density: 0.3,
  baseColor: '#808080',
  speckleColors: ['#606060', '#a0a0a0', '#707070']
});

// Wood grain - furniture, fences, decks, trees
const woodTexture = addons.textures.makeWoodGrain({
  width: 256, height: 256,
  baseColor: '#8B4513',   // Light wood
  ringColor: '#654321',   // Dark rings
  ringCount: 20,
  scale: 1
});

// Brick/tile pattern - walls, floors, roofs
const brickTexture = addons.textures.makeBrick({
  width: 256, height: 256,
  brickColor: '#8B4513',
  mortarColor: '#808080',
  brickWidth: 64,
  brickHeight: 32,
  mortarSize: 4
});

// Color gradients - skies, sunsets, fantasy effects
const gradientTexture = addons.textures.makeGradient({
  width: 256, height: 256,
  colors: ['#ff6b6b', '#ffd93d', '#6bcbff'],
  direction: 'vertical'  // 'horizontal', 'radial'
});

// Stripes - flags, awnings, candy canes
const stripeTexture = addons.textures.makeStripes({
  width: 256, height: 256,
  color1: '#ffffff',
  color2: '#ff0000',
  stripeWidth: 16,
  angle: 45
});

// Grass detail - lawns, meadows
const grassTexture = addons.textures.makeGrass({
  width: 256, height: 256,
  baseColor: '#2d5a27',
  tipColor: '#4a8c3f',
  bladeCount: 200
});
\`\`\`

### Applying Textures to Materials

**IMPORTANT: Scale textures to geometry size!** Textures should repeat based on real-world scale, not use a fixed repeat count.

\`\`\`javascript
// Method 1: Use applyScaled() for common patterns (RECOMMENDED)
// This automatically calculates repeat based on geometry size!
const wallMaterial = addons.materials.stylizedPBR('#ffffff', { roughness: 0.9 });
addons.textures.applyScaled(wallMaterial, 'brick', wallWidth, wallHeight, {
  textureSize: 1,        // Each texture tile = 1 meter
  brickColor: '#a0522d',
  brickWidth: 32,
  brickHeight: 16
});
// Result: A 4m x 3m wall gets 4x3 brick repeats (each brick ~1m)

// Method 2: Use applyWithScale() with any texture
const woodTexture = addons.textures.makeWoodGrain({ baseColor: '#8B4513' });
addons.textures.applyWithScale(material, woodTexture, boardWidth, boardHeight, {
  textureSize: 0.5  // Each plank = 0.5 meters
});

// Method 3: Manual repeat calculation (when you need exact control)
const texture = addons.textures.makeBrick({ brickColor: '#a0522d' });
const tilesPerMeter = 1;  // How many texture tiles per meter
texture.repeat.set(
  Math.round(geometryWidth * tilesPerMeter),
  Math.round(geometryHeight * tilesPerMeter)
);
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;
material.map = texture;
\`\`\`

**Texture Scale Guidelines:**
- **Small objects (< 1m)**: textureSize = 0.25 to 0.5 (more detail)
- **Medium objects (1-5m)**: textureSize = 0.5 to 1.0 (standard)
- **Large objects (> 5m)**: textureSize = 1.0 to 2.0 (larger patterns)
- **Bricks**: textureSize ≈ 0.5-1.0 (each brick ~0.2m wide in reality)
- **Wood planks**: textureSize ≈ 0.3-0.5 (planks are narrow)
- **Stone blocks**: textureSize ≈ 0.5-1.0 (medium stones)

\`\`\`javascript
// Example: House with properly scaled textures
const houseWidth = 6, houseHeight = 4;  // 6m x 4m wall

// Brick wall - each texture tile = 1 meter
const brickMat = addons.materials.stylizedPBR('#ffffff', { roughness: 0.9 });
addons.textures.applyScaled(brickMat, 'brick', houseWidth, houseHeight, {
  textureSize: 1,
  brickColor: '#8B4513'
});

// Chimney - smaller area needs adjusted scale
const chimneyMat = addons.materials.stylizedPBR('#ffffff');
addons.textures.applyScaled(chimneyMat, 'brick', 0.8, 1.5, {
  textureSize: 0.5,  // Smaller tiles for small chimney
  brickColor: '#a0522d'
});

// Wooden trim - tight grain
const woodMat = addons.materials.stylizedPBR('#8B4513');
addons.textures.applyScaled(woodMat, 'wood', 3, 0.3, {
  textureSize: 0.3  // Fine wood grain
});
\`\`\`

**Bump Maps for Extra Detail:**
\`\`\`javascript
// Add bump map with matching scale
const material = addons.materials.stylizedPBR('#808080');
addons.textures.applyScaled(material, 'brick', width, height, { textureSize: 1 });

// Add subtle bump for depth
const bumpTex = addons.textures.makeNoise({ scale: 30, octaves: 2 });
addons.textures.applyWithScale(material, bumpTex, width, height, {
  textureSize: 0.5,
  mapType: 'bumpMap'
});
material.bumpScale = 0.03;
\`\`\`

## Seeded Random Helper

Use this pattern for deterministic randomness:
\`\`\`javascript
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const random = seededRandom(seed);
\`\`\`

## Rules

1. Output ONLY the function code - no markdown, no explanations, no imports
2. Use THREE.* APIs and the provided addons - no other external libraries
3. Use procedural geometry (BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry, etc.)
4. Use MeshStandardMaterial or MeshBasicMaterial for colors (or ShaderMaterial for advanced effects)
5. Keep triangle count under 10,000 total
6. Use instancing (InstancedMesh) for repeated elements like particles or leaves
7. DO NOT use external URLs or fetch() - all assets must be procedurally generated
8. DO NOT use TextureLoader with URLs - only use textures passed in the textures parameter
9. DO NOT use browser globals like window, document, localStorage, etc. - these are blocked for security
10. Always dispose geometries and materials in the dispose() function
11. Make animations smooth and visually interesting
12. Use vibrant, appealing colors unless the prompt specifies otherwise
13. Center the object at origin (0, 0, 0) with the base at y=0
14. For water bodies (lakes, oceans, rivers), USE addons.Water or addons.Water2 instead of particles
15. For skies and outdoor atmospheres, USE addons.Sky
16. For reflective floors/mirrors, USE addons.Reflector
17. KEEP CODE CONCISE - avoid overly complex animations or excessive detail that makes the function too long

## Structural Rules (CRITICAL)

These rules prevent disconnected floating pieces and ensure cohesive objects:

1. **Ground Plane**: For supported assets, place the asset's supporting base at y=0. Attached parts (branches, roofs, windows, hanging lanterns) stay at their intended height; do not move every mesh down to the ground. Intentionally flying or floating parts may remain aloft.
2. **Cohesive Clustering**: For multi-part objects (shrubs, rock clusters, flower clumps), parts MUST overlap or connect. Never position parts with purely random independent offsets.
3. **Relative Positioning**: Always position parts relative to a center point, NOT scattered with independent random coordinates. Use patterns like:
   \`\`\`javascript
   // CORRECT: Relative positioning from center
   const angle = (i / count) * Math.PI * 2;
   const distance = 0.3 + random() * 0.3; // Tight cluster
   mesh.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
   
   // WRONG: Independent random positioning (creates floating pieces)
   mesh.position.set(random() * 5 - 2.5, random() * 3, random() * 5 - 2.5);
   \`\`\`
4. **Maximum Spacing**: For clustered assets, keep parts within 0.3-0.5 units of each other so they visually blend.
5. **Shared Base**: Ground-contact parts of a supported multi-mesh asset share its ground plane. Elevated attached parts need a believable connection to their support, not their own contact with y=0; intentional flying or floating parts are exempt.
6. **Overlap for Density**: For dense objects like shrubs, parts should overlap by 20-40% to create solid-looking forms.

## Material Tips

**PREFER addons.materials presets** for consistent, high-quality results:
- For metallic/shiny: \`addons.materials.metallic('#ffd700', { roughness: 0.2 })\`
- For glowing: \`addons.materials.emissive('#ffff00', { intensity: 1.5 })\`
- For transparent: \`addons.materials.glass('#87CEEB', { opacity: 0.5 })\`
- For low-poly style: \`addons.materials.lowpolyFlat('#228B22')\`
- For cartoon look: \`addons.materials.toon('#ff6b6b', { steps: 4 })\`

**Add procedural textures** for extra detail without external files:
- Wood surfaces: \`material.map = addons.textures.makeWoodGrain({ baseColor: '#8B4513' })\`
- Stone/rock: \`material.map = addons.textures.makeSpeckle({ baseColor: '#808080' })\`
- Brick walls: \`material.map = addons.textures.makeBrick({ brickColor: '#a0522d' })\`

Manual material creation (if presets don't fit):
- \`new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading })\`
- Double-sided: add \`side: THREE.DoubleSide\`

## Geometry Tips

- Use LatheGeometry for rotational shapes (vases, bottles)
- Use ExtrudeGeometry for complex profiles
- Use BufferGeometry for custom shapes
- Use InstancedMesh for many identical objects (particles, leaves, bricks)

## Animation Tips

- Use Math.sin/cos for smooth oscillation
- Use time parameter for continuous motion
- Rotate, scale, and translate for variety
- Keep animations subtle unless the prompt asks for dramatic movement

### Animation Axis Guidelines (IMPORTANT)

Wind sway and natural movement should use the CORRECT axes:

**Horizontal Sway (vegetation, trees, grass, flowers):**
\`\`\`javascript
// Inside createAsset, AFTER positioning this attached foliage mesh and BEFORE
// returning update: capture its rest pose ONCE, outside the animation callback.
// Keep the supporting base fixed; prefer base-pivot rotation for whole plants.
const restX = mesh.position.x;
const restRotationZ = mesh.rotation.z;

function update(time, delta) {
  mesh.rotation.z = restRotationZ + Math.sin(time * speed) * 0.1;
  mesh.position.x = restX + Math.sin(time) * 0.05; // Absolute, bounded sway
}
// Return this update with the asset root (or call it from the asset's update).
// Never accumulate oscillation with += or recapture the rest pose each frame.
// Wind should not add vertical bobbing to grounded vegetation.
\`\`\`

**Vertical Movement (only for floating objects):**
- Y-axis animation is ONLY appropriate for: butterflies, fireflies, floating particles, magic effects
- Vegetation, trees, grass, and grounded objects should NEVER bob up and down

**Rotation for Sway:**
\`\`\`javascript
// Rotate a mesh/group whose local origin is at the plant's base.
// Capture its resting tilt ONCE inside createAsset, outside update.
const restTiltX = mesh.rotation.x;
const restTiltZ = mesh.rotation.z;
function update(time, delta) {
  mesh.rotation.z = restTiltZ + Math.sin(time * windSpeed + offset) * swayAmount;
  mesh.rotation.x = restTiltX + Math.cos(time * windSpeed * 0.7 + offset) * swayAmount * 0.5;
}
// Return this update (or call it from the asset's update).
\`\`\`

## Asset-Type Specific Patterns

### Shrubs and Bushes
Create dense, overlapping foliage from a common center:
\`\`\`javascript
// Shrub pattern: overlapping spheres in tight cluster
for (let i = 0; i < clumpCount; i++) {
  const angle = (i / clumpCount) * Math.PI * 2 + random() * 0.5;
  const distance = 0.2 + random() * 0.3;  // Keep tight: 0.2-0.5 units
  const clump = new THREE.Mesh(sphereGeometry, leafMaterial);
  clump.position.set(
    Math.cos(angle) * distance,
    clumpRadius * 0.5 + random() * clumpRadius * 0.5,  // Stack vertically too
    Math.sin(angle) * distance
  );
  clump.scale.setScalar(0.8 + random() * 0.4);  // Vary sizes
  group.add(clump);
}
\`\`\`

### Rock Clusters
**CRITICAL: Use addons.ConvexGeometry to create proper watertight rock meshes!** This prevents broken faces and gaps that occur with simple vertex displacement.

\`\`\`javascript
// Helper function to create realistic rock geometry using ConvexGeometry
// This creates a proper watertight mesh with NO broken faces!
function createRockGeometry(size, jitterAmount) {
  // Start with a subdivided box worth of points
  const points = [];
  const subdivisions = 2;
  
  for (let x = 0; x <= subdivisions; x++) {
    for (let y = 0; y <= subdivisions; y++) {
      for (let z = 0; z <= subdivisions; z++) {
        // Create base point on box surface
        const px = (x / subdivisions - 0.5) * size[0];
        const py = (y / subdivisions - 0.5) * size[1];
        const pz = (z / subdivisions - 0.5) * size[2];
        
        // Add jitter to each point for organic shape
        const jitteredPoint = new THREE.Vector3(
          px + (random() - 0.5) * jitterAmount,
          py + (random() - 0.5) * jitterAmount,
          pz + (random() - 0.5) * jitterAmount
        );
        points.push(jitteredPoint);
      }
    }
  }
  
  // ConvexGeometry creates a proper closed mesh from any point cloud!
  // This guarantees no broken faces or gaps
  const geometry = new addons.ConvexGeometry(points);
  return geometry;
}

// Rock cluster pattern: proper ConvexGeometry rocks
const rockMaterial = new THREE.MeshStandardMaterial({ 
  color: 0x666666, 
  roughness: 0.9,
  flatShading: true  // Gives rocky, faceted look
});

for (let i = 0; i < rockCount; i++) {
  // Each rock gets unique ConvexGeometry
  const size = 0.3 + random() * 0.5;
  const rockGeo = createRockGeometry(
    [size, size * 0.7, size],  // Slightly flatter
    size * 0.3  // jitter proportional to size
  );
  const rock = new THREE.Mesh(rockGeo, rockMaterial);
  
  const angle = random() * Math.PI * 2;
  const dist = random() * clusterRadius * 0.7;
  
  rock.position.set(
    Math.cos(angle) * dist,
    size * 0.25,  // Partially buried
    Math.sin(angle) * dist
  );
  
  rock.rotation.set(random() * 0.5, random() * Math.PI * 2, random() * 0.5);
  group.add(rock);
}
\`\`\`

**Key rock generation rules:**
- **ALWAYS use addons.ConvexGeometry** for rocks - it guarantees watertight meshes
- Generate a cloud of jittered points from a base shape (box or sphere distribution)
- ConvexGeometry creates the convex hull = no broken faces ever!
- Use flatShading: true in material for faceted rock appearance
- Make rocks slightly flatter (Y dimension smaller) for natural boulder shapes
- Partially bury rocks (position.y = size * 0.25 to 0.35)

### Multi-Part Vegetation (Flowers, Ferns)
Use hierarchical structure with connected parts:
\`\`\`javascript
// Flower pattern: stem connects to center, petals radiate from top
const stem = new THREE.Mesh(stemGeometry, stemMaterial);
stem.position.y = stemHeight / 2;  // Base at y=0
group.add(stem);

const center = new THREE.Mesh(centerGeometry, centerMaterial);
center.position.y = stemHeight;  // At top of stem
group.add(center);

// Petals radiate FROM the center position
for (let i = 0; i < petalCount; i++) {
  const petal = new THREE.Mesh(petalGeometry, petalMaterial);
  const angle = (i / petalCount) * Math.PI * 2;
  petal.position.set(
    Math.cos(angle) * petalOffset,
    stemHeight,  // Same height as center
    Math.sin(angle) * petalOffset
  );
  petal.rotation.z = angle + Math.PI / 2;
  petal.rotation.x = 0.3;  // Tilt outward
  group.add(petal);
}
\`\`\`

### Grass Clumps
Blades should share a common base point:
\`\`\`javascript
// Grass pattern: all blades from same base area
for (let i = 0; i < bladeCount; i++) {
  const blade = new THREE.Mesh(bladeGeometry, grassMaterial);
  const angle = random() * Math.PI * 2;
  const dist = random() * clumpRadius;
  blade.position.set(
    Math.cos(angle) * dist,
    bladeHeight / 2,  // Bottom at y=0
    Math.sin(angle) * dist
  );
  blade.rotation.y = random() * Math.PI * 2;
  blade.rotation.z = (random() - 0.5) * 0.3;  // Slight lean
  group.add(blade);
}
\`\`\`

### Trees with Connected Branches (IMPORTANT)
**Branches MUST be properly connected to the trunk.** Follow these rules:

1. **Translate geometry BEFORE positioning** - Move the pivot to the branch base first
2. **Add branches as children of the trunk** - If the trunk leans, branches follow
3. **Account for trunk taper** - Calculate actual radius at the branch height
4. **Position AT the trunk surface** - Use the trunk radius at that height

\`\`\`javascript
function createTree(trunkHeight, baseRadius, topRadius) {
  const tree = new THREE.Group();
  
  // Create trunk with taper
  const trunkGeometry = new THREE.CylinderGeometry(topRadius, baseRadius, trunkHeight, 8);
  const trunk = new THREE.Mesh(trunkGeometry, barkMaterial);
  trunk.position.y = trunkHeight / 2;  // Trunk base at y=0
  tree.add(trunk);
  
  // Create branches - ADD TO TRUNK so they inherit any trunk rotation!
  const branchCount = 5 + Math.floor(random() * 4);
  
  for (let i = 0; i < branchCount; i++) {
    const branchLength = trunkHeight * (0.3 + random() * 0.3);
    const branchRadius = baseRadius * (0.1 + random() * 0.08);
    
    // STEP 1: Create geometry and translate pivot to BASE of branch
    const branchGeometry = new THREE.CylinderGeometry(
      branchRadius * 0.3,  // Tip radius
      branchRadius,        // Base radius
      branchLength,
      6
    );
    // CRITICAL: Translate geometry so pivot is at the BASE, not center
    branchGeometry.translate(0, branchLength / 2, 0);
    
    const branch = new THREE.Mesh(branchGeometry, barkMaterial);
    
    // STEP 2: Calculate where branch attaches on trunk
    const heightRatio = 0.3 + random() * 0.5;  // 30-80% up the trunk
    const attachHeight = trunkHeight * heightRatio;
    
    // Calculate trunk radius AT this height (linear interpolation for taper)
    const radiusAtHeight = baseRadius + (topRadius - baseRadius) * heightRatio;
    
    // STEP 3: Position at trunk surface
    const angle = (i / branchCount) * Math.PI * 2 + random() * 0.5;
    branch.position.set(
      Math.cos(angle) * radiusAtHeight,
      attachHeight - trunkHeight / 2,  // Relative to trunk center (since trunk.position.y = height/2)
      Math.sin(angle) * radiusAtHeight
    );
    
    // STEP 4: Rotate to point outward and upward
    branch.rotation.z = -Math.PI / 4 + (random() - 0.5) * 0.5;  // Angle up 45° ± variation
    branch.rotation.y = angle;  // Point radially outward
    
    // Add to TRUNK (not tree group!) so it inherits trunk lean
    trunk.add(branch);
    
    // Optional: Add smaller sub-branches
    if (random() > 0.5) {
      const subLength = branchLength * 0.5;
      const subGeo = new THREE.CylinderGeometry(branchRadius * 0.1, branchRadius * 0.3, subLength, 5);
      subGeo.translate(0, subLength / 2, 0);  // Pivot at base
      
      const subBranch = new THREE.Mesh(subGeo, barkMaterial);
      // Position at END of parent branch
      subBranch.position.set(0, branchLength * 0.8, 0);
      subBranch.rotation.z = (random() - 0.5) * 0.8;
      subBranch.rotation.x = (random() - 0.5) * 0.6;
      
      branch.add(subBranch);  // Child of branch!
    }
  }
  
  // If trunk needs to lean, do it AFTER adding branches
  trunk.rotation.z = (random() - 0.5) * 0.2;  // Branches follow automatically!
  
  return tree;
}
\`\`\`

**Key branch attachment rules:**
- **ALWAYS translate geometry first**: \`geometry.translate(0, length/2, 0)\` moves pivot to base
- **Add branches to trunk mesh, not tree group**: This way trunk.rotation affects branches
- **Calculate radius at height for tapered trunks**: \`radius = baseR + (topR - baseR) * heightRatio\`
- **Sub-branches are children of branches**: Creates proper hierarchy
- **Position relative to parent's local space**: branch.position is relative to trunk center

**Root attachment (exposed roots spreading from base):**
\`\`\`javascript
// Roots should be at GROUND LEVEL, spreading outward
const rootCount = 4 + Math.floor(random() * 3);
for (let i = 0; i < rootCount; i++) {
  const rootLength = trunkHeight * 0.25;
  const rootRadius = baseRadius * 0.1;
  
  const rootGeo = new THREE.CylinderGeometry(rootRadius * 0.3, rootRadius, rootLength, 5);
  rootGeo.translate(0, rootLength / 2, 0);  // Pivot at base
  const root = new THREE.Mesh(rootGeo, barkMaterial);
  
  const angle = (i / rootCount) * Math.PI * 2;
  
  // Position at trunk BASE (which is at -trunkHeight/2 in trunk's local space)
  root.position.set(
    Math.cos(angle) * baseRadius * 0.7,
    -trunkHeight / 2,  // At trunk base, which is at ground level
    Math.sin(angle) * baseRadius * 0.7
  );
  
  // Rotate to spread outward and slightly down into ground
  root.rotation.set(
    Math.PI / 2 + 0.3,  // Point outward with slight downward angle
    angle,
    0
  );
  
  trunk.add(root);  // Add to trunk so roots follow trunk lean!
}
\`\`\`

**Key root rules:**
- Roots should be at Y = 0 (ground level) in world space
- Add roots to trunk mesh so they follow trunk lean
- Rotation \`Math.PI / 2\` points horizontally outward, add small angle for downward spread
- Don't position roots at negative Y values or they'll appear under the map!

## Building Grammar System (RECOMMENDED for Architecture)

For buildings (houses, offices, warehouses, towers), use a **Shape Grammar + Additive Assembly** approach. This creates coherent, architecturally correct structures.

### Key Principles

1. **Split Grammar Pipeline**: Volume → Floors → Façades → Bays → Modules
2. **Additive Assembly**: Build walls AROUND windows/doors (no boolean cuts)
3. **Bay System**: Divide façades into regular bays for consistent window placement
4. **Style Consistency**: Use consistent floor heights, window sizes, and materials

### Building a Simple House/Office

\`\`\`javascript
// Define architectural rules (style-dependent)
const FLOOR_HEIGHT = 3.2;       // meters
const BAY_WIDTH = 2.0;          // window spacing
const WALL_DEPTH = 0.2;
const WINDOW_WIDTH = 1.0;
const WINDOW_HEIGHT = 1.5;
const SILL_HEIGHT = 0.9;        // floor to window bottom
const DOOR_WIDTH = 1.2;
const DOOR_HEIGHT = 2.2;

// Materials
const wallMat = addons.materials.stylizedPBR('#E0E0E0', { roughness: 0.8 });
const trimMat = addons.materials.stylizedPBR('#404040', { roughness: 0.5 });
const glassMat = addons.materials.glass('#88CCFF', { opacity: 0.3 });

// Apply brick texture with proper scaling
addons.textures.applyScaled(wallMat, 'brick', buildingWidth, FLOOR_HEIGHT, {
  textureSize: 1,
  brickColor: '#8B4513'
});

// ADDITIVE ASSEMBLY: Create window bay (walls around opening)
function createWindowBay(bayWidth, floorHeight) {
  const bay = new THREE.Group();
  
  const headerHeight = floorHeight - SILL_HEIGHT - WINDOW_HEIGHT;
  const sideWidth = (bayWidth - WINDOW_WIDTH) / 2;
  
  // Bottom sill panel
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(bayWidth, SILL_HEIGHT, WALL_DEPTH),
    wallMat
  );
  sill.position.set(bayWidth/2, SILL_HEIGHT/2, 0);
  bay.add(sill);
  
  // Top header panel
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(bayWidth, headerHeight, WALL_DEPTH),
    wallMat
  );
  header.position.set(bayWidth/2, SILL_HEIGHT + WINDOW_HEIGHT + headerHeight/2, 0);
  bay.add(header);
  
  // Left/right side panels
  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, WINDOW_HEIGHT, WALL_DEPTH),
    wallMat
  );
  leftPanel.position.set(sideWidth/2, SILL_HEIGHT + WINDOW_HEIGHT/2, 0);
  bay.add(leftPanel);
  
  const rightPanel = leftPanel.clone();
  rightPanel.position.x = bayWidth - sideWidth/2;
  bay.add(rightPanel);
  
  // Window frame + glass (in the opening)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(WINDOW_WIDTH + 0.1, WINDOW_HEIGHT + 0.1, 0.06),
    trimMat
  );
  frame.position.set(bayWidth/2, SILL_HEIGHT + WINDOW_HEIGHT/2, WALL_DEPTH * 0.1);
  bay.add(frame);
  
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW_WIDTH - 0.1, WINDOW_HEIGHT - 0.1),
    glassMat
  );
  glass.position.set(bayWidth/2, SILL_HEIGHT + WINDOW_HEIGHT/2, WALL_DEPTH * 0.15);
  bay.add(glass);
  
  return bay;
}

// Build façade by splitting into bays
function buildFacade(facadeWidth, floorHeight, hasDoor) {
  const facade = new THREE.Group();
  const bayCount = Math.floor(facadeWidth / BAY_WIDTH);
  const actualBayWidth = facadeWidth / bayCount;
  const doorBay = hasDoor ? Math.floor(bayCount / 2) : -1;
  
  for (let i = 0; i < bayCount; i++) {
    let bay;
    if (i === doorBay) {
      bay = createDoorBay(actualBayWidth, floorHeight);
    } else {
      bay = createWindowBay(actualBayWidth, floorHeight);
    }
    bay.position.x = i * actualBayWidth - facadeWidth / 2;
    facade.add(bay);
  }
  
  return facade;
}
\`\`\`

### Roof Types

\`\`\`javascript
// Flat roof with parapet
function createFlatRoof(width, depth) {
  const roof = new THREE.Group();
  
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.15, depth),
    roofMat
  );
  slab.position.y = 0.075;
  roof.add(slab);
  
  // Parapet walls (raised edge)
  const parapetHeight = 0.5;
  const frontParapet = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, parapetHeight, 0.15),
    wallMat
  );
  frontParapet.position.set(0, 0.15 + parapetHeight/2, depth/2);
  roof.add(frontParapet);
  // ... repeat for other sides
  
  return roof;
}

// Gabled roof (triangular profile)
function createGabledRoof(width, depth, pitch) {
  const roofHeight = (width / 2) * Math.tan(pitch * Math.PI / 180);
  
  const shape = new THREE.Shape();
  shape.moveTo(-width/2 - 0.3, 0);
  shape.lineTo(0, roofHeight);
  shape.lineTo(width/2 + 0.3, 0);
  shape.lineTo(-width/2 - 0.3, 0);
  
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: depth + 0.6,
    bevelEnabled: false
  });
  
  const roof = new THREE.Mesh(geo, roofMat);
  roof.position.z = -depth/2 - 0.3;
  return roof;
}
\`\`\`

### Available Style Kits (for reference)

When generating buildings, use these style guides:

- **modern_glass**: Floor height 3.2m, dense windows, flat roof, concrete/glass materials
- **industrial_brick**: Floor height 3.5m, grid windows, flat parapet, brick textures
- **medieval_timber**: Floor height 2.8m, small casement windows, steep gable roof, timber + plaster
- **coastal_wood**: Floor height 2.8m, shuttered windows, moderate gable, white + navy palette
- **fantasy_stone**: Floor height 3.5m, arched slit windows, conical roof, gray stone

### Building Examples by Prompt

| Prompt | Key Parameters |
|--------|---------------|
| "Modern office building" | 3+ floors, dense windows, flat roof, glass/concrete |
| "Medieval tavern" | 2 floors, small windows, steep gable, timber frame |
| "Industrial warehouse" | 2 floors, sparse grid windows, flat parapet, brick |
| "Coastal cottage" | 1 floor, shuttered windows, gable roof, white/blue |
| "Fantasy wizard tower" | 4+ floors, narrow windows, conical roof, stone |
${examplesSection}${getFamilyPromptSection(assetFamily)}
## Remember

Your output should be ONLY the function code, starting with \`function createAsset(THREE, seed, textures, params, addons) {\` and nothing else before or after. No markdown code blocks, no explanations.

When the prompt involves water, lakes, rivers, oceans, ponds, etc. - USE addons.Water or addons.Water2, NOT particles!`
}

/**
 * Generate a repair prompt when code execution fails
 */
export function getRepairPrompt(originalCode, errorMessage, failure = null) {
  const categoryLine = failure?.category
    ? `Failure category: ${failure.category}\n`
    : ''
  const blockedPatternLine = failure?.diagnostics?.offendingPattern
    ? `Blocked pattern: ${failure.diagnostics.offendingPattern}\n`
    : ''
  const criticFeedbackLine = failure?.diagnostics?.criticFeedback
    ? `Critic feedback: ${failure.diagnostics.criticFeedback}\n`
    : ''

  return `The following ThreeJS code failed to execute with this error:

ERROR: ${errorMessage}
${categoryLine}${blockedPatternLine}${criticFeedbackLine}

ORIGINAL CODE:
\`\`\`javascript
${originalCode}
\`\`\`

Please fix the code and output ONLY the corrected function. Remember:
- Output ONLY the function code, no markdown or explanations
- The function signature must be: function createAsset(THREE, seed, textures, params, addons)
- Must return { root, update, dispose }
- Use THREE.* APIs and addons.* for Water, Sky, Reflector, SimplexNoise
- No external URLs or imports
- Do not use browser globals like window or document`
}

export function getCriticRegenerationPrompt({ originalPrompt, criticFeedback, assetFamily = 'general' }) {
  const treeRetryGuidance = assetFamily === 'treePlant'
    ? `

Tree retry guidance:
- Rebuild the tree around one readable leader, attached branches, and species-appropriate foliage support.
- Meet any numeric targets in the critic feedback (trunk-height percentage, attachment distances) with comfortable margin.
- For pines, use branch whorls or staggered branch tiers with broader lower boughs, exposed branch intervals, and visible branch support beneath foliage pads.
- Keep asymmetry within a clear conifer taper, and avoid center-stacked cone bunches.
- If the prompt includes snow, use supported snow placement on upper-facing branch or foliage surfaces.
- Add a root flare or exposed roots so the base feels planted.
- Do not use evenly stacked cone/disc repetition.
- Do not use floating foliage blobs or a single oversized sphere canopy.`
    : ''

  return `The previous creative generation did not meet the quality bar.

Original prompt: ${originalPrompt}
Asset family: ${assetFamily}
Critic feedback: ${criticFeedback}

Generate a fresh replacement that fixes the critic feedback. Do not patch the prior code incrementally; rewrite the asset so it reads as a stronger, more cohesive result while still matching the original prompt.${treeRetryGuidance}

Output ONLY the function code, starting with function createAsset(THREE, seed, textures, params, addons) {`
}
import { RUNTIME_CONTRACT, GEOMETRY_GUIDANCE } from './runtimeContract.js'
