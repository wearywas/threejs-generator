import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeAsset } from './assets.js';
import { WORLD } from './game.js';

const mint = 0xa8ffe3;

export function createScene(container, initialState) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'A miniature UFO above a tabletop scattered with snacks, books, a coffee mug, and a cleaning robot');
  renderer.domElement.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 100);
  camera.position.set(0, 26, 23);
  camera.lookAt(0, 0, 0);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.45;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff9e9, 0xc79583, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1d7, 2.6);
  sun.position.set(-8, 18, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.1, far: 55 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 4;
  scene.add(sun);

  const owned = [];
  const generated = [];
  const add = (object, parent = scene) => { parent.add(object); owned.push(object); return object; };
  function box(w, h, d, color, x, y, z, radius = 0.12) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), new THREE.MeshStandardMaterial({ color, roughness: 0.76 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return add(mesh);
  }
  function asset(kind, size, x, z, options) {
    const instance = makeAsset(kind, size, options);
    instance.root.position.set(x, 0, z);
    scene.add(instance.root);
    generated.push(instance);
    return instance;
  }

  // A quiet procedural wood finish keeps every visible asset local.
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 1024; woodCanvas.height = 768;
  const wood = woodCanvas.getContext('2d');
  wood.fillStyle = '#dca977'; wood.fillRect(0, 0, 1024, 768);
  for (let i = 0; i < 360; i++) {
    const y = i * 2.18;
    wood.strokeStyle = i % 4 === 0 ? 'rgba(112,66,37,0.055)' : 'rgba(255,229,189,0.1)';
    wood.lineWidth = 0.7 + (i % 3) * 0.3;
    wood.beginPath(); wood.moveTo(0, y);
    wood.bezierCurveTo(260, y + Math.sin(i) * 12, 690, y - Math.sin(i * 0.34) * 14, 1024, y + 4);
    wood.stroke();
  }
  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  box(25.5, 0.63, 17.5, 0xad7250, 0, -0.47, 0, 0.26);
  box(25.5, 0.1, 17.5, 0xe8b891, 0, -0.2, 0, 0.04);
  const tabletop = box(25.6, 0.24, 17.6, 0xffffff, 0, -0.12, 0, 0.1);
  tabletop.material.map = woodTexture;
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.13 }));
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = -1.3;
  shadowFloor.receiveShadow = true; add(shadowFloor);

  const coaster = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2, 0.09, 64), new THREE.MeshStandardMaterial({ color: 0xf4debc, roughness: 0.95 }));
  coaster.position.set(WORLD.mug.x, 0.045, WORLD.mug.z); coaster.receiveShadow = true; add(coaster);
  const cup = asset('mug', 3.3, WORLD.mug.x, WORLD.mug.z, { height: true, center: false });
  cup.root.position.y = 0.09;
  cup.root.rotation.y = -0.2;
  asset('books', 4.3, 1, -3.8).root.rotation.y = 0.04;
  const pen = asset('pencil', 5.8, 6, 3.2);
  pen.root.rotation.y = -0.48;
  const player = asset('saucer', 2.05, initialState.player.x, initialState.player.z);
  const bot = asset('robot', 2.25, initialState.robot.x, initialState.robot.z);

  const food = new Map();
  const icingColors = [0xf58291, 0xf3b951, 0x8cbdb2, 0xbba4d3];
  for (const snack of initialState.snacks) {
    const instance = asset(snack.kind, snack.kind === 'biscuit' ? 1.15 : 1.6, snack.x, snack.z, { seed: 1042 + snack.id * 199 });
    instance.root.rotation.y = snack.id * 1.78;
    if (snack.kind === 'doughnut') {
      const icing = instance.source.getObjectByName('Icing');
      icing?.traverse(o => { if (o.isMesh && o.material.color && !o.isInstancedMesh) o.material.color.setHex(icingColors[Math.floor(snack.id / 3) % icingColors.length]); });
    }
    food.set(snack.id, instance);
  }

  // Paper is set dressing, kept outside the useful flight paths.
  const note = box(2.6, 0.022, 2.25, 0xf9ebc4, -9.4, 0.025, 5.9, 0.01);
  note.rotation.y = -0.16;
  const noteCanvas = document.createElement('canvas');
  noteCanvas.width = 256; noteCanvas.height = 256;
  const ctx = noteCanvas.getContext('2d');
  ctx.fillStyle = '#f9ebc4'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#52716e'; ctx.font = 'bold 29px "Trebuchet MS"'; ctx.textAlign = 'center';
  ctx.fillText('save some', 128, 64); ctx.fillText('for later!', 128, 101);
  ctx.strokeStyle = '#cd8875'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(128, 158, 37, 23, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(128, 157, 12, 7, 0, 0, Math.PI * 2); ctx.stroke();
  const noteTexture = new THREE.CanvasTexture(noteCanvas); noteTexture.colorSpace = THREE.SRGBColorSpace;
  const noteFace = new THREE.Mesh(new THREE.PlaneGeometry(2.58, 2.22), new THREE.MeshStandardMaterial({ map: noteTexture, roughness: 1 }));
  noteFace.rotation.set(-Math.PI / 2, 0, -0.16); noteFace.position.set(-9.4, 0.042, 5.9); add(noteFace);

  const crumbGeometry = new THREE.DodecahedronGeometry(0.045, 0);
  const crumbMaterial = new THREE.MeshStandardMaterial({ color: 0xa56837, roughness: 1 });
  const crumbs = new THREE.InstancedMesh(crumbGeometry, crumbMaterial, 55);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 55; i++) {
    dummy.position.set(Math.sin(i * 127.1) * 10.8, 0.04, Math.cos(i * 73.7) * 7.1);
    dummy.rotation.set(i, i * 2, i * 3); dummy.scale.setScalar(0.5 + ((i * 17) % 10) / 10);
    dummy.updateMatrix(); crumbs.setMatrixAt(i, dummy.matrix);
  }
  add(crumbs);

  const beamMaterial = new THREE.MeshBasicMaterial({ color: mint, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.95, 1, 48, 1, true), beamMaterial));
  const ring = add(new THREE.Mesh(new THREE.RingGeometry(0.86, 0.92, 64), new THREE.MeshBasicMaterial({ color: 0x86e4c0, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })));
  ring.rotation.x = -Math.PI / 2;
  const halo = add(new THREE.Mesh(new THREE.CircleGeometry(0.87, 48), new THREE.MeshBasicMaterial({ color: mint, transparent: true, opacity: 0.13, depthWrite: false })));
  halo.rotation.x = -Math.PI / 2;
  const liftLight = new THREE.PointLight(mint, 0, 4, 2); scene.add(liftLight);

  function label(text, color, width = 2.7) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = color; c.beginPath(); c.roundRect(5, 5, 502, 118, 56); c.fill();
    c.fillStyle = '#fffaf0'; c.font = 'bold 46px "Trebuchet MS"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 67);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(width, width / 4, 1); sprite.renderOrder = 10; add(sprite);
    return sprite;
  }
  const stashLabel = label('Your stash', '#416c64', 2.8);
  stashLabel.position.set(WORLD.mug.x, 4.2, WORLD.mug.z);
  const playerLabel = label('You', '#e78465', 1.15);
  const animations = new Map();
  const particles = [];
  const particleGeometry = new THREE.IcosahedronGeometry(0.075, 0);
  const particleMaterials = [0xffd176, 0x89d6be, 0xf58f87].map(color => new THREE.MeshBasicMaterial({ color }));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visualTime = 0;
  let lastWidth = 0, lastHeight = 0;

  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height || (width === lastWidth && height === lastHeight)) return;
    lastWidth = width; lastHeight = height;
    renderer.setSize(width, height);
    const aspect = width / height;
    const viewHeight = Math.max(20.7, 28.5 / aspect);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }

  function burst(x, y, z) {
    if (reducedMotion) return;
    for (let i = 0; i < 15; i++) {
      const mesh = new THREE.Mesh(particleGeometry, particleMaterials[i % 3]);
      mesh.position.set(x, y, z); scene.add(mesh);
      const angle = i * Math.PI * 2 / 15;
      particles.push({ mesh, vx: Math.cos(angle) * 2, vy: 2 + (i % 3) * 0.8, vz: Math.sin(angle) * 2, life: 1 });
    }
  }

  function update(state, dt) {
    resize();
    const paused = state.phase === 'paused';
    const motionDt = paused ? 0 : dt;
    visualTime += motionDt;
    for (const event of state.events) {
      const snack = food.get(event.snackId);
      if (event.type === 'deliver' && snack) {
        animations.set(event.snackId, { type: 'deliver', age: 0, from: snack.root.position.clone() });
        burst(WORLD.mug.x, 3.6, WORLD.mug.z);
      } else if (event.type === 'sweep' && snack) {
        animations.set(event.snackId, { type: 'sweep', age: 0, from: snack.root.position.clone() });
      }
    }
    const p = state.player;
    const distanceToMug = Math.hypot(p.x - WORLD.mug.x, p.z - WORLD.mug.z);
    const mugLift = 1 - THREE.MathUtils.smoothstep(distanceToMug, 1.7, 3.5);
    const bob = reducedMotion ? 0 : Math.sin(visualTime * 2.7) * 0.065;
    player.root.position.set(p.x, 1.65 + mugLift * 2.45 + bob, p.z);
    player.root.rotation.x = THREE.MathUtils.lerp(player.root.rotation.x, p.vz * 0.035, 1 - Math.exp(-8 * dt));
    player.root.rotation.z = THREE.MathUtils.lerp(player.root.rotation.z, -p.vx * 0.035, 1 - Math.exp(-8 * dt));
    player.root.rotation.y = reducedMotion ? 0 : Math.sin(visualTime * 0.25) * 0.12;
    player.root.visible = p.stun <= 0 || Math.floor(visualTime * 15) % 2 === 0;
    playerLabel.position.copy(player.root.position).add(new THREE.Vector3(0, 1.6, 0));
    playerLabel.visible = state.phase === 'ready';
    const emitter = player.source.getObjectByName('beamRing');
    player.update?.(visualTime, motionDt);
    if (emitter?.material) emitter.material.emissiveIntensity = state.beam ? 4 : 1.4;
    bot.root.position.set(state.robot.x, 0.03, state.robot.z);
    bot.root.rotation.y = state.robot.angle;
    bot.update?.(visualTime, motionDt);
    const leftBrush = bot.source.getObjectByName('leftBrush');
    const rightBrush = bot.source.getObjectByName('rightBrush');
    if (leftBrush) leftBrush.rotation.y = visualTime * 8;
    if (rightBrush) rightBrush.rotation.y = -visualTime * 8;

    beam.visible = state.beam && state.phase === 'playing';
    const beamTop = player.root.position.y + 0.22;
    beam.position.set(p.x, beamTop / 2, p.z);
    beam.scale.y = beamTop;
    beamMaterial.opacity = 0.11 + Math.sin(visualTime * 8) * 0.02;
    ring.position.set(p.x, 0.025, p.z);
    ring.material.opacity = state.beam ? 0.8 : 0.26;
    halo.position.set(p.x, 0.021, p.z); halo.visible = beam.visible;
    liftLight.position.set(p.x, 0.7, p.z); liftLight.intensity = beam.visible ? 2 : 0;
    stashLabel.material.color.set(state.player.carrying !== null ? 0xd7ffe7 : 0xffffff);
    if (!reducedMotion) stashLabel.position.y = 4.2 + Math.sin(visualTime * 2) * 0.07;

    for (const snack of state.snacks) {
      const instance = food.get(snack.id);
      const animation = animations.get(snack.id);
      instance.root.scale.setScalar(1);
      instance.root.visible = snack.status === 'ground' || snack.status === 'carried' || !!animation;
      if (animation) {
        animation.age += motionDt;
        const t = Math.min(1, animation.age / 0.65);
        const target = animation.type === 'deliver' ? new THREE.Vector3(WORLD.mug.x, 1.3, WORLD.mug.z) : new THREE.Vector3(state.robot.x, 0.3, state.robot.z);
        instance.root.position.lerpVectors(animation.from, target, t * t);
        instance.root.rotation.y += motionDt * 5;
        instance.root.scale.setScalar(1 - t * 0.95);
        if (t === 1) { animations.delete(snack.id); instance.root.visible = false; }
      } else if (snack.status === 'carried') {
        const targetY = player.root.position.y - 0.65;
        instance.root.position.lerp(new THREE.Vector3(p.x, targetY, p.z), 1 - Math.exp(-10 * dt));
        instance.root.rotation.y += motionDt * 0.8;
        instance.root.rotation.z = reducedMotion ? 0 : Math.sin(visualTime * 4) * 0.06;
      } else if (snack.status === 'ground') {
        instance.root.position.set(snack.x, 0.025, snack.z);
        instance.root.rotation.z = 0;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i]; particle.life -= motionDt;
      particle.vy -= motionDt * 7;
      particle.mesh.position.x += particle.vx * motionDt;
      particle.mesh.position.y += particle.vy * motionDt;
      particle.mesh.position.z += particle.vz * motionDt;
      particle.mesh.scale.setScalar(Math.max(0, particle.life));
      if (particle.life <= 0) { scene.remove(particle.mesh); particles.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }

  function reset() {
    animations.clear();
    for (const p of particles) scene.remove(p.mesh);
    particles.length = 0;
    for (const instance of food.values()) instance.root.scale.setScalar(1);
    visualTime = 0;
  }
  function project(x, y, z) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    const rect = container.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }
  function dispose() {
    generated.forEach(instance => instance.dispose?.());
    const geometry = new Set(), materials = new Set(), textures = new Set();
    for (const object of owned) object.traverse(o => {
      if (o.geometry) geometry.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m);
    });
    materials.forEach(m => { if (m.map) textures.add(m.map); m.dispose(); });
    geometry.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
    woodTexture.dispose(); particleGeometry.dispose(); particleMaterials.forEach(m => m.dispose());
    environmentMap.dispose(); renderer.dispose(); renderer.domElement.remove();
  }
  resize();
  return { update, resize, reset, project, dispose };
}
