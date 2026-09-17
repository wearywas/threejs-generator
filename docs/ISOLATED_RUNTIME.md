# Generated-code runtime

The only production execution route for generated, imported, restored, and shipped-example JavaScript is an isolated browser Worker. There is no editor-thread compatibility fallback. Curated generators are trusted repository code and run locally on the main thread.

See [README](../README.md) for setup, [User Guide](USER_GUIDE.md) for workflows, [Technical Overview](TECHNICAL_OVERVIEW.md) for state/server architecture, and [Development](DEVELOPMENT.md) for verification commands.

## Boundary and source map

```text
Editor: document, controls, camera, bitmap presentation
  -> sandbox iframe (allow-scripts only; opaque origin)
     -> bundled Blob Worker: factory, Three objects, renderers, exports
  <- private MessagePort: validated data, GLB bytes, PNG, ImageBitmap
```

- [CodeSandbox.js](../src/runtime/CodeSandbox.js) exposes `executeCode` as an alias for [isolated/client.js](../src/runtime/isolated/client.js). It does not evaluate source.
- [broker.js](../src/runtime/isolated/broker.js) creates the nonce-authorized iframe document and worker. The iframe broker receives trusted bundled runtime text, not generated source to execute. `allow-same-origin` is absent. Its CSP denies external connections, forms, base URLs, and external script sources; Blob workers inherit their creator's CSP.
- [server/workerBundle.js](../server/workerBundle.js) bundles locally installed worker dependencies as `virtual:asset-worker-source`. Worker execution modules must not be imported into the host to support development watching.
- [worker.js](../src/runtime/isolated/worker.js) removes its bootstrap listener, retains the private port in module scope, and restricts ambient APIs before factory execution. Removal of fetch, sockets, nested Workers, `importScripts`, and similar APIs is defense in depth; source-pattern checks are early diagnostics, not a security boundary.
- [factory.js](../src/runtime/isolated/factory.js) evaluates the factory indirectly, without the bridge's lexical scope. Generated closures, objects, materials, animation callbacks, and custom disposal remain worker-side.
- [protocol.js](../src/runtime/isolated/protocol.js) validates explicit inputs and returned metadata, GLB headers/length, PNG data URLs, analysis, and optimization counts. [transport.js](../src/runtime/isolated/transport.js) owns request deadlines and closes the runtime on timeout or malformed replies.

The host does not evaluate returned source or callbacks. Instance-spec source is export text, not host-executed behavior. Opaque-origin restrictions prevent access to the app's origin storage. This boundary depends on browser enforcement; it is not a general guarantee that hostile JavaScript cannot disrupt a browser.

## Factory contract

```javascript
function createAsset(THREE, seed, textures, params, addons) {
  const root = new THREE.Group();
  return { root, update(time, delta) {}, dispose() {} };
}
```

`root` must be a Three Object3D. Optional animation is `update(time, delta)` or `tick(time, delta)`; `update` takes precedence. A custom `dispose` hook is honored by worker-side asset disposal; otherwise a resource traversal is used. Final host disposal terminates the worker and must not be treated as a guarantee that generated cleanup callbacks ran.

Three.js is pinned to r169. `seed`, `params`, and texture data are explicit execution inputs, restored from the saved document when rebuilding an asset. The factory receives copies, not mutable access to library records. Registered [addons](../src/runtime/addons.js) and [canvas helpers](../src/runtime/canvas.js) are supplied locally. The app owns the renderer and animation scheduling.

- No DOM `window`, `document`, or image element is supplied. Use OffscreenCanvas or addon texture helpers for procedural textures.
- `THREE.TextureLoader` is replaced with a loader accepting only the supplied PNG/JPEG/WebP data URLs. Images are decoded before factory execution, so returned textures already have image data. Arbitrary URLs and SVG are unsupported.
- Seeds are persisted, but repeatability still depends on factory behavior. The runtime does not rewrite arbitrary randomness or freeze time.
- The geometric critic runs in the worker and returns advisory notes. Its `accepted` field is not a workspace acceptance gate. Invalid factory results and the configured triangle limit are execution failures.

## Host handle, views, and ownership

`await executeCode(code, options)` returns metadata plus a remote handle, **not** `asset.root` or a callable generated `update`:

```javascript
const asset = await executeCode(code, {
  seed: 12345, params: {}, textures: {}, signal,
});
try {
  const bytes = await asset.exportGLB();
  // Validated GLB ArrayBuffer; no generated callbacks cross the boundary.
} finally {
  asset.dispose();
}
```

Other handle operations attach/resize/detach views, set a camera, capture a thumbnail, analyze the asset, select batch optimization, and export the selected batch layout. [views.js](../src/runtime/isolated/views.js) owns worker WebGL renderers and variant assets. Primary and batch views have separate scenes; only asset content, not studio helpers, is exported.

WebGL canvases are created inside the worker. Completed ImageBitmaps cross to a host `bitmaprenderer` canvas, with one acknowledged frame in flight per view. The host sends bounded camera and size data, not DOM-linked WebGL canvases. [isolatedPreview.js](../src/components/isolatedPreview.js) coalesces camera/resize requests, serializes replacement attaches behind prior detaches, and prevents stale views from presenting on a reused canvas.

Each worker reuses at most two renderer/canvas pairs across preview replacements. Cleared scenes and reset cameras retain their identities too, bounding Three r169's per-scene/camera transmission targets for glass. Detaching a view disposes its owned variants, helpers, shadow map, optimization data, and render lists, but retains the context for the next view. This avoids a Chromium software-driver stall during forced context loss after bitmap presentation. Idle renderers retain their last bounded drawing-buffer allocation; final asset disposal terminates the worker and releases both contexts. No geometry, material, or rendering-quality reduction is involved.

[assetWorkspace.js](../src/runtime/assetWorkspace.js) owns committed runtimes and provides leases for views/export/capture. A pending operation's abort stops its candidate; it does not stop the previous committed asset. Replacement releases the old workspace owner after committing the new document/runtime; consumer leases delay final disposal. If a committed worker later fails, its document remains editable, but remote preview/export operations fail until another runtime is built.

## Deadlines and bounded messages

Values below are enforced in `client.js`, `transport.js`, `protocol.js`, `worker.js`, and `views.js`. They are not hard process-wide resource quotas.

| Operation/data | Current bound |
| --- | --- |
| Broker startup | 10 seconds |
| Factory initialization | 5 seconds by default; caller timeout clamped to 100 ms–30 seconds |
| View attach | 15 seconds |
| Resize, camera, detach, liveness reply | 5 seconds |
| Thumbnail / instance analysis | 10 seconds |
| Single GLB, layout GLB, optimization | 30 seconds |
| Pending/waiting RPC requests | 32 |
| Source | 500,000 JavaScript string code units (`code.length`) |
| Serialized input | 32,000,000 code units (`JSON.stringify(input).length`) |
| Supplied textures | Up to 32; each data URL at most 7,000,000 code units; decoded image at most 4096 per axis and 16,000,000 pixels |
| Factory triangle budget | 50,000 by default, including instances; execution options can lift it |
| Views / batch grid | At most two attached views; batch grid 1x1–5x5 |
| Framebuffer | At most 4096 per axis / 4096x4096 pixels; effective pixel ratio capped at 2 and reduced to fit |
| GLB reply | At most 64 MiB; magic, version 2, and declared byte length checked |
| Thumbnail | Requested dimensions 1–512 per axis; returned PNG data URL at most 2,000,000 code units |
| Metadata / instance analysis | Serialized size limits of 32,000 / 8,000,000 code units plus schemas |

When no command is pending, the host pings the private port every second, allowing five seconds for a reply. This detects a blocked worker event loop, including synchronous animation loops when no user command is pending. Commands (including pings) are dispatched one at a time, with each deadline starting at dispatch rather than while waiting in the bounded queue. Preview construction, export, and other active work therefore retain their own deadlines without an unrelated shorter heartbeat interrupting them. A host-owned timeout closes active and queued requests, terminates the worker through its lifetime channel, and removes the iframe. Unlike an in-thread timer, this can stop synchronous generated JavaScript without running it on the editor thread.

## Export and optimization behavior

[glbExport.js](../src/runtime/glbExport.js) exports detached geometry snapshots and preserves flat-shaded face normals without modifying live geometry. JavaScript animation callbacks are not baked into GLB tracks. Thumbnail capture temporarily fits the primary camera and restores its configuration; batch export pauses ticks while encoding the selected layout.

[batchOptimizer.js](../src/runtime/batchOptimizer.js) creates a separate static instancing snapshot when exact geometry/material and rendering-state checks permit it. Animation/custom behavior can make optimization unavailable, and some meshes remain unconsolidated. The original layout stays available. Validated results contain measured before/after renderer counts and a small report; optimized Three objects never cross to the host. Layout GLB exports that selected snapshot; instance-spec/batchable-source export remains a separate analysis of the original asset.

## What this does not guarantee

This is browser origin/thread isolation, not an OS process sandbox, hard memory/GPU quota, or a proof of generated-code correctness. Large allocations, heavy shaders, browser vulnerabilities, and mutation of worker-side library prototypes can still exhaust resources or disrupt the browser. Texture checks occur after decoding, and other output checks occur after some worker allocations. Private-port isolation protects host capabilities; it does not make arbitrary-code metadata trustworthy.

Neither GLB header validation nor schema validation proves downstream visual fidelity. Exported JavaScript loses this boundary when executed elsewhere. The loopback API's credential/CSRF protections are separate from worker isolation and do not make this app suitable for public hosting.

## Verification

Unit suites cover factory behavior, protocol validation, transport deadlines/queuing, workspace cancellation, saved inputs, disposal, view lifecycle, batch optimization, and export snapshots. The adapters in [src/test/isolatedRuntime.js](../src/test/isolatedRuntime.js) are test-only; a Node test is not evidence of browser-origin enforcement.

[smoke-isolation.mjs](../scripts/smoke-isolation.mjs) exercises real browser storage/network restrictions, factory/animation hangs, textures, frames, export/analysis, and cleanup using the dev module entry. [smoke-isolation-ui.mjs](../scripts/smoke-isolation-ui.mjs) and [smoke-asset-state.mjs](../scripts/smoke-asset-state.mjs) exercise UI/runtime behavior against a running app, including production. These harnesses abort or mock provider requests. [smoke-providers.mjs](../scripts/smoke-providers.mjs) also intercepts provider requests and requires a server without environment keys for its missing-key assertions.

Use the [Development guide](DEVELOPMENT.md) for the maintained browser-test/release workflow. Do not substitute historical smoke results, an old dependency-audit result, or this document for a fresh run. Live-provider and downstream-engine verification require separate evidence.
