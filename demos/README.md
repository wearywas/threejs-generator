# Demos

Small, runnable projects showing how exported ThreeJS Generator source can be used in another application.

Each demo is an independent project with its own lockfile. The root generator install and build do not include demo dependencies or bundles. Both demos run locally without API keys and import their supplied JavaScript assets directly.

## Snack Abduction

[Snack Abduction](snack-abduction/README.md) is a 90-second tabletop heist: pilot a tiny UFO, lift biscuits and doughnuts, and stash them in a mug before the cleaning robot gets them. All seven models come from exported `.js` files. The game imports their `createSavedAsset` factories directly and animates their named parts.

From the repository root:

```sh
npm --prefix demos/snack-abduction ci
npm run demo:snack-abduction
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174).

To check this demo:

```sh
npm --prefix demos/snack-abduction test
npm --prefix demos/snack-abduction run build
cd demos/snack-abduction
npm exec playwright install chromium
npm run test:browser
```

The browser suite starts a dedicated demo server on port 5199. It never reuses the live game on port 5174. CI runs the demo's checks separately from the generator's tests.

## Little Borough

[Little Borough](little-borough/README.md) is a relaxed neighborhood planner. Add and remove apartment floors, create buildings with different coordinated palettes, and watch varied cars and delivery vans drive around a central park. The six exported `.js` assets provide the buildings, vehicles, trees, benches and streetlights. Floor changes rebuild actual geometry and animate into place.

From the repository root:

```sh
npm --prefix demos/little-borough ci
npm run demo:little-borough
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175). This demo uses a strict port; stop an existing copy before starting another one on the same port.

To check this demo:

```sh
npm --prefix demos/little-borough test
npm --prefix demos/little-borough run build
cd demos/little-borough
npm exec playwright install chromium
npm run test:browser
```

The browser suite uses port 5200, leaving the generator tests on 5198 and Snack Abduction tests on 5199. CI checks both demos on Windows and Linux and preserves their browser diagnostics on failure.
