# Snack Abduction

A tiny tabletop heist built from seven JavaScript assets exported by ThreeJS Generator. Fly a miniature UFO, steal the snacks, and drop them into your coffee mug before the cleaning robot gets them.

## Run locally

Node.js 24 is recommended, matching the generator. From the repository root, in PowerShell:

```powershell
cd demos/snack-abduction
npm.cmd ci
npm.cmd run dev
```

Open [http://127.0.0.1:5174/](http://127.0.0.1:5174/). Port 5174 leaves the generator's usual 5173 port free, so both can run while recording. If another copy of the demo is already running, Vite prints an alternative port; use that URL, or stop the other copy first. After installing this demo's dependencies, you can also run `npm run demo:snack-abduction` from the repository root.

## Play

- **WASD / arrow keys:** move the saucer.
- **Hold Space:** lift a nearby snack and keep carrying it.
- **Release Space over the mug:** stash the snack and score.
- **Release elsewhere:** drop the snack back on the desk.
- **Escape:** pause/resume. Switching windows also pauses the round.
- Touch screens have a direction pad and a beam button.

Biscuits are worth 100 points, doughnuts 250. Bigger snacks slow the saucer. The robot sweeps up loose snacks and knocks cargo loose if it bumps you. Books block your path; you can fly over the pencil. The saucer automatically rises near the mug. A round ends after 90 seconds or when all snacks have been saved or swept. Sound, fullscreen, restart and a locally saved best score are included.

Desktop Chrome or Edge gives the clearest view for recording. The fullscreen button removes surrounding browser chrome when the browser supports it. Audio begins after pressing the start button.

## How the generated code is used

The original seven `.js` exports in this folder are unchanged. There are no GLB files or model loaders. `src/assets.js` imports each `createSavedAsset` factory, calls it with the pinned Three.js version, and adds its generated root to the scene. A wrapper adjusts scale and placement. Saved source and seeds stay in the exports.

```js
import * as THREE from 'three';
import { createSavedAsset } from './a-charming-miniature-flying-saucer-with-a-flattened.js';

const saucer = createSavedAsset(THREE);
scene.add(saucer.root);

// Generated parts remain ordinary editable Three.js objects.
const emitter = saucer.root.getObjectByName('beamRing');
emitter.material.emissiveIntensity = 4;

// Forward the animation callback from the export in the render loop.
saucer.update?.(elapsedSeconds, deltaSeconds);
```

The game animates the named `leftBrush` / `rightBrush` groups, adjusts the saucer emitter, and recolors generated doughnut icing. The mug's sticker is drawn by its original generated function through a small canvas-texture helper. Different seeds produce snack variation. The tabletop, paper note, beam and particles are supporting game scenery.

Use only trusted generated source: these files run as ordinary application modules. This demo is a local game, not an arbitrary-code upload service.

## Files

- `src/game.js`: pure gameplay rules, collision, robot routing, score and round state.
- `src/timing.js`: short simulation steps independent of render frequency.
- `src/assets.js`: generated asset imports and normalization.
- `src/scene.js`: lighting, camera, tabletop, asset animation and effects.
- `src/main.js`: controls, interface, pause and lifecycle.
- `src/audio.js`: small synthesized sound effects.

## Checks and production build

```powershell
npm.cmd test
npm.cmd exec playwright install chromium
npm.cmd run test:browser
npm.cmd run build
npm.cmd run preview
```

Run these checks from `demos/snack-abduction`. The browser suite starts its own server on port 5199 and does not use a running game on port 5174.

The build is written to this demo's `dist` folder. The production preview uses [http://127.0.0.1:4174/](http://127.0.0.1:4174/). The static build uses relative asset paths so it can be served from a subdirectory. All fonts and game assets are bundled locally; gameplay makes no model/API requests and needs no backend. The generator's root build does not include this demo.

This demo is covered by the repository's [MIT license](../../LICENSE). Built with [Three.js](https://threejs.org/docs/) and [Vite](https://vite.dev/guide/). Three.js stays at **0.169.0**, matching the generator exports. Bundled fonts: Fredoka and DM Sans, distributed under the SIL Open Font License through Fontsource. [Third-party notices](public/THIRD_PARTY_NOTICES.txt) and font licenses are included in the static build along with generated dependency license notices.
