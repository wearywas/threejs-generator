import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSavedAsset as apartment } from '../a-modern-apartment-building.js';
import { createSavedAsset as hatchback } from '../a-simple-hatchback-car-face-the-front-toward.js';
import { createSavedAsset as van } from '../a-compact-urban-delivery-van-face-the-front.js';
import { createSavedAsset as tree } from '../a-well-kept-deciduous-street-tree-approximately-5.js';
import { createSavedAsset as streetlight } from '../a-contemporary-neighborhood-streetlight-approximately-5-5.js';
import { createSavedAsset as bench } from '../a-contemporary-public-park-bench-with-warm-timber.js';
import { PLOTS, PALETTES } from './model.js';
import { createRoadLoop } from './traffic.js';

const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function roundedPath(halfWidth, halfDepth, radius, Type = THREE.Shape) {
  const s = new Type(), w = halfWidth, h = halfDepth, r = radius;
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

export function createNeighborhood(container, { onEdit, onHover, onSelect }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'City canvas. Drag to rotate, Shift-drag to pan. Use the plot menu to build with a keyboard.');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce9eb');
  const camera = new THREE.OrthographicCamera(-55, 55, 45, -45, .1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .1;
  controls.minPolarAngle = .28;
  controls.maxPolarAngle = Math.PI / 2.35;
  controls.minZoom = .6;
  controls.maxZoom = 3;
  controls.screenSpacePanning = false;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .75;
  const resetView = () => {
    controls.reset();
    controls.target.set(0, 1, 0);
    camera.position.set(78, 74, 92);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  };
  resetView();

  scene.add(new THREE.HemisphereLight('#f4fbff', '#779b8c', 2));
  const sun = new THREE.DirectionalLight('#fff6e3', 2.8);
  sun.position.set(-36, 65, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -61, right: 61, top: 61, bottom: -61, near: 1, far: 150 });
  sun.shadow.normalBias = .055;
  sun.shadow.bias = -.00015;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const geometries = new Set(), materials = new Set();
  const staticAssets = [], plots = new Map(), traffic = [], particles = [];
  const ownGeometry = g => (geometries.add(g), g);
  const material = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .88, ...extra });
    materials.add(m); return m;
  };
  const blockGeo = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const box = (w, h, d, x, y, z, mat, parent = scene) => {
    const m = new THREE.Mesh(blockGeo, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    m.receiveShadow = true; parent.add(m); return m;
  };
  const surface = (w, d, r, y, mat, parent = scene) => {
    const m = new THREE.Mesh(ownGeometry(new THREE.ShapeGeometry(roundedPath(w, d, r), 10)), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; parent.add(m); return m;
  };
  const addAsset = (factory, x, z, rotation = 0, params = {}, seed = 1) => {
    const a = factory(THREE, { params, seed });
    a.root.position.set(x, .12, z); a.root.rotation.y = rotation;
    scene.add(a.root); staticAssets.push(a); return a;
  };

  const ground = material('#dce9eb');
  box(500, .1, 500, 0, -2.05, 0, ground);
  const baseGeo = ownGeometry(new THREE.ExtrudeGeometry(roundedPath(42.5, 42.5, 9), { depth: 1.4, bevelEnabled: true, bevelSize: .35, bevelThickness: .25, bevelSegments: 3, steps: 1 }));
  baseGeo.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(baseGeo, material('#8facaa'));
  base.position.y = -1.7; base.castShadow = true; base.receiveShadow = true; scene.add(base);
  surface(42.3, 42.3, 8.8, -.04, material('#93b69e'));

  const roadShape = roundedPath(40, 40, 14);
  roadShape.holes.push(roundedPath(31, 31, 5, THREE.Path));
  const road = new THREE.Mesh(ownGeometry(new THREE.ShapeGeometry(roadShape, 24)), material('#68828a'));
  road.rotation.x = -Math.PI / 2; road.position.y = .015; road.receiveShadow = true; scene.add(road);
  surface(31, 31, 5, .045, material('#bdcdd0'));
  surface(29, 29, 3, .07, material('#cad8d5'));

  const stripe = material('#eceddd');
  const roadMiddle = createRoadLoop(35.5, 35.5, 9.5);
  const dashCount = Math.floor(roadMiddle.length / 5.6);
  for (let i = 0; i < dashCount; i++) {
    const p = roadMiddle.sample(i * roadMiddle.length / dashCount);
    const dash = box(.16, .015, 2.4, p.x, .04, p.z, stripe);
    dash.rotation.y = p.heading;
  }
  // Four crossings make the park accessible from each side of the block.
  for (let side = 0; side < 4; side++) {
    const group = new THREE.Group(); group.rotation.y = side * Math.PI / 2; scene.add(group);
    for (let i = 0; i < 7; i++) box(3.3, .02, .65, 0, .045, 31.8 + i * 1.14, stripe, group);
  }

  const park = surface(13.5, 13.5, 1.4, .10, material('#86ad81'));
  park.name = 'Village green';
  const pathMat = material('#e1dfc8');
  box(3.6, .04, 27, 0, .13, 0, pathMat);
  box(27, .04, 3.6, 0, .13, 0, pathMat);
  const fountainBase = new THREE.Mesh(ownGeometry(new THREE.CylinderGeometry(3.6, 3.8, .3, 48)), material('#e0e8df'));
  fountainBase.position.y = .3; fountainBase.receiveShadow = true; scene.add(fountainBase);
  const fountain = new THREE.Mesh(ownGeometry(new THREE.TorusGeometry(2.65, .3, 8, 48)), material('#b3c8c7'));
  fountain.rotation.x = Math.PI / 2; fountain.position.y = .66; fountain.castShadow = true; scene.add(fountain);
  const water = new THREE.Mesh(ownGeometry(new THREE.CircleGeometry(2.6, 48)), material('#6cb6c0', { roughness: .22, metalness: .1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = .53; scene.add(water);
  const centerpiece = new THREE.Mesh(ownGeometry(new THREE.CylinderGeometry(.5, .85, 1.5, 24)), material('#b3c8c7'));
  centerpiece.position.y = .9; centerpiece.castShadow = true; scene.add(centerpiece);
  const fountainTop = new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(.62, 20, 12)), material('#77b9c2', { roughness: .25 }));
  fountainTop.scale.y = .4; fountainTop.position.y = 1.7; scene.add(fountainTop);

  const treePositions = [[-8,-8],[-8,8],[8,-8],[8,8],[-10,-4],[10,4]];
  const greens = ['#638849', '#4d8763', '#94a960', '#60844b', '#719e61', '#497a60'];
  treePositions.forEach(([x,z], i) => addAsset(tree, x, z, i * 1.1, { height: 5.4 + (i % 3) * .8, foliageColor: greens[i], canopyWidth: .94 + (i % 2) * .13, foliageIrregularity: 1.3, foliageCount: 4 + i % 3 }, 812 + i * 197));
  for (const [x,z,r] of [[-5.4,-3.3,0],[5.4,3.3,Math.PI],[-3.3,6,Math.PI/2],[3.3,-6,-Math.PI/2]]) addAsset(bench, x, z, r);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (const p of [-17, 17]) {
      const x = p * Math.cos(a) + 29.8 * Math.sin(a), z = -p * Math.sin(a) + 29.8 * Math.cos(a);
      addAsset(streetlight, x, z, a);
    }
  }

  const plusMaterial = material('#94b1ad');
  const padGeo = ownGeometry(new THREE.ShapeGeometry(roundedPath(6.5, 6.5, .7), 6));
  for (const p of PLOTS) {
    const padMat = material('#b6cbbf');
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2; pad.position.set(p.x, .13, p.z); pad.receiveShadow = true; pad.userData.plotId = p.id;
    scene.add(pad);
    const marker = new THREE.Group(); marker.position.set(p.x, .155, p.z); scene.add(marker);
    box(1.45, .025, .15, 0, 0, 0, plusMaterial, marker);
    box(.15, .025, 1.45, 0, 0, 0, plusMaterial, marker);
    // Modest corner marks keep the buildable area legible without a wire grid.
    for (const x of [-5.8, 5.8]) for (const z of [-5.8, 5.8]) {
      box(.75, .025, .07, x - Math.sign(x) * .34, 0, z, plusMaterial, marker);
      box(.07, .025, .75, x, 0, z - Math.sign(z) * .34, plusMaterial, marker);
    }
    const wrapper = new THREE.Group(); wrapper.position.set(p.x, .16, p.z); wrapper.rotation.y = p.rotation; wrapper.userData.plotId = p.id; scene.add(wrapper);
    plots.set(p.id, { ...p, pad, padMat, marker, wrapper, asset: null, entry: null, animation: null });
  }

  const carColors = ['#e7bb63','#6698aa','#dfdfce','#bf786a','#739b89','#798aa9','#d9ae72','#ece6da'];
  const contactMat = new THREE.MeshBasicMaterial({ color: '#31474b', opacity: .13, transparent: true, depthWrite: false }); materials.add(contactMat);
  const contactGeo = ownGeometry(new THREE.CircleGeometry(1, 24));
  for (let i = 0; i < 8; i++) {
    const isVan = i === 2 || i === 6;
    const a = (isVan ? van : hatchback)(THREE, { seed: 190 + i * 221, params: { bodyColor: carColors[i], paintRoughness: .38, spokeCount: 4 + i % 5, wheelVentCount: 5 + i % 6 } });
    a.root.traverse(o => { o.castShadow = false; });
    const shadow = new THREE.Mesh(contactGeo, contactMat); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.1, 2.2, 1); shadow.position.y = .065;
    const vehicle = new THREE.Group(); vehicle.add(a.root, shadow); scene.add(vehicle); staticAssets.push(a);
    const outer = i >= 4;
    const loop = createRoadLoop(outer ? 37.4 : 33.3, outer ? 37.4 : 33.3, outer ? 11.4 : 7.3);
    const wheels = []; a.root.traverse(o => { if (/^wheel(Front|Rear)(Left|Right)$/.test(o.name)) wheels.push(o); });
    traffic.push({ vehicle, wheels, loop, distance: loop.length * (i % 4) / 4, direction: outer ? -1 : 1, speed: outer ? 4.7 : 4.1 });
  }

  const dustGeometry = ownGeometry(new THREE.IcosahedronGeometry(1, 0));
  for (let i = 0; i < 70; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? '#e0decb' : '#f3edda', transparent: true, depthWrite: false }); materials.add(mat);
    const mesh = new THREE.Mesh(dustGeometry, mat); mesh.visible = false; scene.add(mesh);
    particles.push({ mesh, life: 0, vx: 0, vz: 0, size: 0 });
  }
  let particleCursor = 0;
  function dust(plot, count = 16) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < count; i++) {
      const p = particles[particleCursor++ % particles.length], angle = Math.random() * TAU;
      p.life = p.duration = .55 + Math.random() * .3;
      p.size = .23 + Math.random() * .38;
      p.vx = Math.sin(angle) * (1 + Math.random() * 2); p.vz = Math.cos(angle) * (1 + Math.random() * 2);
      p.mesh.position.set(plot.x + Math.sin(angle) * 5, .4, plot.z + Math.cos(angle) * 4.5);
      p.mesh.visible = true;
    }
  }

  function sync(city, animate = true) {
    // Stage replacements first: if a factory fails, the visible city stays intact.
    const replacements = [];
    try {
      for (const plot of plots.values()) {
        const entry = city.buildings[plot.id] ?? null;
        if (JSON.stringify(entry) === JSON.stringify(plot.entry)) continue;
        const asset = entry ? apartment(THREE, { seed: entry.seed, params: { ...PALETTES[entry.palette], floorCount: entry.floors, windowOpacity: 1, scale: 1 } }) : null;
        replacements.push({ plot, entry, asset });
      }
    } catch (error) { replacements.forEach(r => r.asset?.dispose()); throw error; }
    for (const { plot, entry, asset } of replacements) {
      const oldFloors = plot.entry?.floors ?? 0;
      const startY = plot.wrapper.scale.y;
      if (asset) {
        plot.wrapper.clear(); plot.asset?.dispose();
        plot.asset = asset; plot.wrapper.add(asset.root);
        if (animate && !reducedMotion.matches) {
          const previousHeight = oldFloors ? 5.9 + (oldFloors - 1) * 2.7 : .15;
          const newHeight = 5.9 + (entry.floors - 1) * 2.7;
          plot.animation = { time: 0, from: Math.max(.03, previousHeight * startY / newHeight), removing: false };
        } else { plot.animation = null; plot.wrapper.scale.set(1, 1, 1); }
      } else if (animate && !reducedMotion.matches && plot.asset) {
        plot.animation = { time: 0, from: startY, removing: true };
      } else {
        plot.wrapper.clear(); plot.asset?.dispose(); plot.asset = null; plot.animation = null; plot.wrapper.scale.set(1, 1, 1);
      }
      plot.entry = entry;
      plot.marker.visible = !entry;
      if (animate) dust(plot);
    }
    renderer.shadowMap.needsUpdate = true;
  }

  let selected = null, hovered = null, tool = 1, gesture = null;
  const pointers = new Set();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function pick(event) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...plots.values()].flatMap(p => [p.pad, p.wrapper]), true);
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData.plotId) object = object.parent;
      if (object) return object.userData.plotId;
    }
    return null;
  }
  function highlight() {
    for (const p of plots.values()) p.padMat.color.set(p.id === hovered ? (tool === 1 ? '#d4e6cf' : '#e9cec0') : p.id === selected ? '#ceded1' : '#b6cbbf');
  }
  function select(id) { selected = id; highlight(); }
  const canvas = renderer.domElement;
  function down(event) {
    pointers.add(event.pointerId);
    if (pointers.size > 1) { if (gesture) gesture.dragged = true; return; }
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, dragged: event.shiftKey || event.ctrlKey || event.metaKey, plot: pick(event) };
  }
  function move(event) {
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.dragged = true;
    hovered = pointers.size ? null : pick(event);
    highlight();
    canvas.style.cursor = pointers.size ? 'grabbing' : hovered ? 'pointer' : 'grab';
    onHover(hovered, event);
  }
  function up(event) {
    pointers.delete(event.pointerId);
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture; gesture = null;
    if (g.dragged || Math.hypot(event.clientX - g.x, event.clientY - g.y) > 6 || ![0,2].includes(g.button)) return;
    const id = pick(event);
    if (id && id === g.plot) { select(id); onSelect(id); onEdit(id, g.button === 2 ? -1 : tool); }
  }
  function cancel(event) { pointers.delete(event.pointerId); gesture = null; }
  function leave() { hovered = null; highlight(); onHover(null); }
  const preventMenu = e => e.preventDefault();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('contextmenu', preventMenu);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
    const halfHeight = Math.max(49, 53 / aspect);
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  let last = performance.now(), frameId, stopped = false;
  function frame(now) {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    controls.update();
    const clampedX = THREE.MathUtils.clamp(controls.target.x, -28, 28), clampedZ = THREE.MathUtils.clamp(controls.target.z, -28, 28);
    camera.position.x += clampedX - controls.target.x; camera.position.z += clampedZ - controls.target.z;
    controls.target.x = clampedX; controls.target.z = clampedZ;
    for (const p of plots.values()) {
      const a = p.animation; if (!a) continue;
      a.time += dt;
      if (a.removing) {
        const t = Math.min(1, a.time / .25), scale = a.from * (1 - t * t);
        p.wrapper.scale.set(1 + t * .1, Math.max(.001, scale), 1 + t * .1);
        if (t === 1) { p.wrapper.clear(); p.asset?.dispose(); p.asset = null; p.animation = null; p.wrapper.scale.set(1, 1, 1); }
      } else {
        const t = a.time, spring = Math.exp(-9 * t) * Math.cos(14 * t);
        const y = 1 + (a.from - 1) * spring;
        const squash = 1 + Math.sin(t * 13) * Math.exp(-8 * t) * .06;
        p.wrapper.scale.set(squash, Math.max(.015, y), squash);
        if (t > .75) { p.wrapper.scale.set(1,1,1); p.animation = null; }
      }
      renderer.shadowMap.needsUpdate = true;
    }
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt; const progress = 1 - p.life / p.duration;
      p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt; p.mesh.position.y += dt * .65;
      p.mesh.scale.setScalar(p.size * (1 + progress * 1.7));
      p.mesh.material.opacity = Math.max(0, (1 - progress) * .65); p.mesh.visible = p.life > 0;
    }
    for (const car of traffic) {
      if (!reducedMotion.matches) car.distance += dt * car.speed * car.direction;
      const point = car.loop.sample(car.distance);
      car.vehicle.position.set(point.x, .045, point.z); car.vehicle.rotation.y = point.heading + (car.direction < 0 ? Math.PI : 0);
      if (!reducedMotion.matches) for (const wheel of car.wheels) wheel.rotation.x += dt * car.speed / .35;
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  renderer.shadowMap.needsUpdate = true;
  frameId = requestAnimationFrame(frame);

  return {
    sync, select, resetView,
    setTool(value) { tool = value; highlight(); },
    dispose() {
      stopped = true; cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose();
      for (const [event, handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['pointerleave',leave],['contextmenu',preventMenu]]) canvas.removeEventListener(event, handler);
      for (const p of plots.values()) p.asset?.dispose();
      staticAssets.forEach(a => a.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      renderer.dispose(); canvas.remove();
    },
  };
}
