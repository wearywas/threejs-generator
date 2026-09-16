/** Shared capabilities for every task that emits executable factory source. */
export const RUNTIME_CONTRACT = `Execution environment: an isolated browser Worker with Three.js r169, not a web page.
Use only THREE, seed, textures, params, addons and normal JavaScript math/data APIs.
No window, document, app storage, network, external imports, or nested workers are available.
For procedural textures use addons.textures helpers or OffscreenCanvas, never document.createElement.
THREE.TextureLoader accepts only the provided textures slot data URLs (PNG/JPEG/WebP); arbitrary URLs and SVG are unsupported.
Return the root Object3D and optional update(time, delta)/dispose callbacks. The app owns the renderer and animation loop.`

/** Geometry rules shared by generation, conversion, animation, and editing. */
export const GEOMETRY_GUIDANCE = `Surface construction (including GLB export):
- Intersecting solid volumes are fine for joined parts and dense foliage; duplicate or coplanar visible faces cause z-fighting. Give one owner for each exposed surface, especially where adjacent modules meet.
- Derive repeated floors, slabs, walls, and roofs from shared module boundaries. Do not emit the same exposed slab or face twice at a floor boundary.
- Recess glazing and project cladding/trim using deliberate, scale-relative physical clearance. Include half-thickness when calculating face positions; different box centers can still produce identical outer faces.
- Keep this clearance and connected construction across the full parameter range, including minimum/maximum floor counts and dimensions. Avoid stacked transparent panes occupying the same plane.
- Do not use polygonOffset, renderOrder, or disabled depth testing to hide construction errors. Repair the actual geometry so the fix survives GLB export to other renderers.`
