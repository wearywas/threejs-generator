# Demos

Small, runnable projects showing how exported ThreeJS Generator source can be used in another application.

## Snack Abduction

[Snack Abduction](snack-abduction/README.md) is a 90-second tabletop heist: pilot a tiny UFO, lift biscuits and doughnuts, and stash them in a mug before the cleaning robot gets them. All seven models come from exported `.js` files. The game imports their `createSavedAsset` factories directly and animates their named parts.

From the repository root:

```sh
npm --prefix demos/snack-abduction ci
npm run demo:snack-abduction
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174). Each demo is an independent project with its own lockfile; the root generator install and build do not include demo dependencies or bundles.

To check this demo:

```sh
npm --prefix demos/snack-abduction test
npm --prefix demos/snack-abduction run build
cd demos/snack-abduction
npm exec playwright install chromium
npm run test:browser
```

The browser suite starts a dedicated demo server on port 5199. It never reuses the live game on port 5174. CI runs the demo's checks separately from the generator's tests.
