# Technical overview

Maintainer map of the current application. See [README](../README.md) for setup, [User Guide](USER_GUIDE.md) for workflows, [Development](DEVELOPMENT.md) for verification, and [Isolated Runtime](ISOLATED_RUNTIME.md) for the generated-code boundary.

## Architecture

React 18, Vite 8, Three.js **0.169.0**, plain JavaScript/JSX, Tailwind 3, Zod, and Vitest. Node requirements and commands are defined in [package.json](../package.json). This is a loopback local application, not a public multi-user service.

The main prompt has one code-generation flow. Anthropic, OpenAI, or the opt-in experimental Codex connection returns a `createAsset` factory through the local Node API. Generated source runs in an isolated browser Worker; the editor receives data and rendered frames, not generated Three objects or callbacks.

Two other starting points need no model request: seven curated presets in [builtinTemplates.js](../src/services/builtinTemplates.js), and shipped generated examples indexed by [generatedStarters.js](../src/services/generatedStarters.js). Curated presets use trusted repository generators on the main thread; generated examples use the same isolated route as newly generated or imported source. Neither is an automatic fallback after a provider error.

Internal document modes remain `curated` (validated generator spec), `creative` (source), and `procedural` (source with parameter controls). They are not separate provider choices or prompt-generation tiers.

| Responsibility | Source of truth |
| --- | --- |
| UI composition, editor draft, dialogs | [App.jsx](../src/components/App.jsx) |
| Atomic asset operations and React subscription | [assetActions.js](../src/runtime/assetActions.js), [assetWorkspace.js](../src/runtime/assetWorkspace.js), [useAssetWorkspace.js](../src/hooks/useAssetWorkspace.js) |
| Model tasks, repair policy, progress | [generationService.js](../src/api/generationService.js), [creativeFailure.js](../src/api/creativeFailure.js), [generationProgress.js](../src/api/generationProgress.js) |
| Browser transport and local API | [llmClient.js](../src/api/llmClient.js), [server/api.js](../server/api.js), [server/providers.js](../server/providers.js) |
| Experimental Codex connection | [adapter.js](../server/codex/adapter.js), [policy.js](../server/codex/policy.js), [rpc.js](../server/codex/rpc.js), [taskFormats.js](../server/codex/taskFormats.js) |
| Generated runtime | [CodeSandbox.js](../src/runtime/CodeSandbox.js), [isolated/client.js](../src/runtime/isolated/client.js), [isolated/worker.js](../src/runtime/isolated/worker.js) |
| Curated runtime | [AssetFactory.js](../src/runtime/AssetFactory.js), [generators](../src/generators), [assetSpec.js](../src/schemas/assetSpec.js) |
| Saved inputs and recovery | [assetDocument.js](../src/services/assetDocument.js), [generationLibrary.js](../src/services/generationLibrary.js), [workspaceRecovery.js](../src/services/workspaceRecovery.js) |
| Exports and batch optimization | [exporter.js](../src/runtime/exporter.js), [glbExport.js](../src/runtime/glbExport.js), [assetSource.js](../src/services/assetSource.js), [batchOptimizer.js](../src/runtime/batchOptimizer.js) |

## Generation and model transport

1. `assetActions.generate()` selects an explicit seed, snapshots default texture inputs, classifies the asset family, and retrieves up to three relevant saved examples.
2. `generationService` builds the prompt and calls `llmClient`, which sends a non-streaming request to `/api/message` using the local session cookie and CSRF token.
3. In API-key mode, `server/providers.js` calls the fixed Anthropic Messages or OpenAI Responses endpoint using Node's `fetch`. Anthropic responses stream into a server-side buffer so HTTP headers and keepalive events can arrive while the model is generating. `server/anthropicStream.js` retains visible text and model/usage metadata, ignores thinking content, and requires a terminal `message_stop`. The browser still receives one complete JSON response. OpenAI uses its existing non-streaming Responses request. In Codex mode, the private adapter sends the request through its owned stdio App Server process and accepts only a successful terminal final answer. Refusals, incomplete output, abnormal completion, empty output, malformed streams and interrupted streams are rejected before returning text. The transport does not retry or silently change provider/model.
4. The client normalizes the response and executes it through `CodeSandbox.js`, an alias for the isolated client. Runtime metadata includes the geometric critic's advisory notes. The critic does not reject assets or trigger retries; factory validation and the triangle budget can reject them.
5. Only a complete document/runtime candidate replaces the current asset. Code failures can use the bounded repair/regeneration policy, normally within three total attempts. API failures and cancellation exit immediately. Conversion, animation, and editing use the same service and runtime boundary.

The progress panel explains additional requests using short, plain-language summaries from `src/api/retryReason.js`. Known validation paths and code failures identify causes such as invalid model dimensions, missing values, or excessive detail. A truncated worker error can still be summarized when its first validation issue is complete; otherwise an unknown failure gets a neutral explanation. Raw diagnostics remain with the existing failure and repair logic, and formatting never changes retry decisions or makes a model request.

The [shared runtime prompt](../src/prompts/runtimeContract.js) applies to code-emitting tasks. [codeSystemPrompt.js](../src/prompts/codeSystemPrompt.js) supplies generation guidance and examples; its regression tests matter when changing wording. [claudeService.js](../src/api/claudeService.js) is only a compatibility re-export, not an SDK client.

Few-shot selection is browser-library dependent. Creative and procedural records are ranked by family/prompt relevance, with complete-source limits of 12,000 characters per example and 24,000 total. These are selection checks, not proof that saved code is high quality. An empty library changes the model context.

### Local API and credentials

The optional Codex adapter uses a separate application-owned managed ChatGPT profile and ephemeral threads in empty temporary directories. It does not reuse the Desktop conversation or copy normal Codex credentials/configuration. Exact-version checks, an OS-variable-only child environment, effective feature/integration checks and explicit empty tool environments restrict the generation process. Source/configuration checks are not binary attestation or a general OS-sandbox guarantee. Keep the dedicated profile free of externally added instructions/integrations; startup inventories are not lifetime guarantees if another process modifies it. The browser-generated-code boundary remains unchanged. See [setup](CODEX_SETUP.md) and [maintenance](DEVELOPMENT.md#experimental-codex-provider).

[vite.config.js](../vite.config.js) installs the shared API in development and preview; [server/start.js](../server/start.js) serves `dist` and that API for `npm start`. Default bindings are `127.0.0.1:5173` for development and `127.0.0.1:4173` for preview/start. `PORT` overrides the standalone server port.

Keys entered in Model settings transit the browser request, then remain in Node session memory. The app does not persist provider keys in browser storage or asset records. Optional server environment keys are defaults, not session credentials; forgetting a session key can reveal the environment fallback, and restarting does not remove environment configuration. `envPrefix: []` prevents Vite's automatic public environment exposure.

Current source defaults are Anthropic `claude-fable-5-1` and OpenAI `gpt-6-astra`; these are configuration defaults, not a guarantee of account access. `LLM_PROVIDER` selects the default provider. `ANTHROPIC_MODEL[_TASK]` and `OPENAI_MODEL[_TASK]` select server models; a nonempty session override wins for that provider across tasks. Legacy `VITE_ANTHROPIC_*` configuration is read server-side only. Consult [llmConfig.js](../src/config/llmConfig.js) and `server/api.js` when changing precedence or token budgets.

The API checks loopback Host/port and allowed Origin, requires Origin plus CSRF for POST, uses an HttpOnly `SameSite=Strict` session cookie scoped to `/api`, limits JSON bodies to 2 MiB, and permits one active model request per session. Sessions expire after one hour idle, with active requests exempt; the server caps sessions at 128. Upstream requests have a 15-minute deadline per provider call, reported as `provider_timeout` separately from cancellation. The browser has no additional generation timer, and Cancel still aborts an active request immediately. Known connection/header/body timeout errors also map to a safe timeout message; raw provider errors and credentials are never echoed. Anthropic event buffers are limited to 1,048,576 string code units and accumulated visible text to 500,000, matching the runtime's source limit. These controls are for the local browser/API boundary, not authentication for public hosting or protection against other privileged local software.

| Route | Contract |
| --- | --- |
| `GET /api/health`, `/api/generators`, `/api/generator/:name/schema` | Health and curated generator discovery; no model call |
| `GET /api/session` | Create/refresh session; return public settings and CSRF token, never the key |
| `POST /api/settings` | Select provider/model, set or forget a session key |
| `POST /api/codex/connect`, `/api/codex/login` | Opt-in same-origin connection check / explicit managed sign-in; no model turn |
| `POST /api/message` | Task, system prompt, text messages, bounded output budget; return normalized text/model/usage |
| `POST /api/generate` | Companion prompt-to-code endpoint; returns source and metadata, does not execute or batch it |
| `POST /api/asset/code` | Authenticated request returns 501; no standalone curated-source API |

Companion clients must be explicitly allowed through `LLM_ALLOWED_ORIGINS` (comma-separated exact local HTTP origins). Use the same loopback hostname across apps for same-site cookies, fetch the session with credentials included, and include `X-CSRF-Token` plus JSON content type on POST. Codex routes and requests additionally require the app's own origin, regardless of companion allowlisting. Generation API errors are marked non-retryable. Cancel aborts the browser request and disconnect cancellation aborts upstream work; this cannot undo provider work, charges or allowance already consumed.

## Documents, ownership, and recovery

[assetDocument.js](../src/services/assetDocument.js) defines version-1 immutable, serializable inputs: mode, prompt/family, source or spec, parameter schema, seed, resolved params, texture slots/data, and restoration notes. Runtime objects, editor drafts, cameras, and credentials are not part of that document.

- Generate, load, import, re-run, parameter/seed/texture changes, and AI edits build candidates through `assetActions`. The workspace commits the document and runtime together and disposes stale candidates.
- Failed or cancelled changes preserve the last committed pair. Parameter edits allow one active build and one merged queued patch; controls can display an intended draft while the prior asset remains committed.
- Runtime ownership is reference-counted. Views, thumbnail capture, analysis, and export hold leases; replacing the workspace asset releases its owner without disposing resources still in use. Local disposal honors a custom disposer or traverses resources as a fallback; isolated disposal terminates the worker.
- The editor draft is separate. Save, AI edits, and export use the committed document until a re-run succeeds. A stopped committed worker does not erase its document; re-run/load/edit can construct another runtime.

Library records persist seed, params, texture inputs, source/spec, and controls in IndexedDB. Old records without inputs receive explicit restoration notes: missing seeds get a stable replacement, missing parameter values use defaults, and missing textures are not silently replaced with global textures. Persisted inputs enable repeatability for code that respects them; they do not force arbitrary generated code, time-dependent behavior, or different rendering environments to be deterministic.

[useWorkspaceRecovery.js](../src/hooks/useWorkspaceRecovery.js), [recoveryController.js](../src/services/recoveryController.js), and `workspaceRecovery.js` maintain one separate IndexedDB recovery copy containing the committed document and optional code draft. Startup offers restore/discard before accepting workspace actions; restore rebuilds the runtime rather than restoring GPU state. Serialized writes use record-ID comparisons inside transactions to avoid overwriting another tab's newer copy. Broadcast/focus checks surface conflicts, which do not trigger automatic takeover. Storage failure or browser-data clearing can lose this safety net: recovery is not a backup or a substitute for explicit Library saves/downloads.

Library, recovery, and default texture storage are browser-origin/profile local. Changing hostname, port, or browser profile can make prior records appear absent.

## Preview and export contracts

Generated factories implement:

```javascript
function createAsset(THREE, seed, textures, params, addons) {
  const root = new THREE.Group();
  return { root, update(time, delta) {}, dispose() {} };
}
```

`root` is required; `update` (or `tick`) and `dispose` are optional. Worker-side Three objects stay in the worker. Host controls send camera/size data and display ImageBitmap frames. Curated assets instead use [LocalPreviewCanvas.jsx](../src/components/LocalPreviewCanvas.jsx). [renderPolicy.js](../src/runtime/renderPolicy.js) conservatively selects on-demand rendering for known-static assets; animation, custom hooks, and dynamic resources retain continuous rendering. See [Isolated Runtime](ISOLATED_RUNTIME.md) for capabilities, deadlines, and limits.

| Output | What it contains / does not contain |
| --- | --- |
| Single-asset GLB | Detached geometry snapshot from the committed runtime; no preview studio helpers. JavaScript animation callbacks are not baked into animation tracks. |
| Generated `.js` | Original factory plus data-only `assetPreset` and `createSavedAsset(THREE, overrides, addons)`. Preserves saved seed/params/textures/controls, not a captured animation frame; Three.js and app-specific addons/helpers are not bundled. |
| Curated `.js` | Specification and runtime usage example, not a bundled standalone generator or a published-package guarantee. |
| Batch layout GLB | The currently displayed original or optimized grid, including variant transforms/instancing, without studio lights/guides. Use 1x1 for one asset. |
| `.batchable.js` | Declarative instance specification plus original source for a compatible consumer. Does not contain the displayed grid or automatic optimization. A standalone instance-spec JSON contains only the analysis; its estimates are not measured preview performance. |

[glbExport.js](../src/runtime/glbExport.js) creates detached export geometry and bakes face normals for flat-shaded surfaces without rewriting live buffers. Export cannot promise that arbitrary shaders, addon effects, or appearance survive every downstream renderer. Saved-source imports parse preset JSON without evaluating the module in the editor realm, then execute the extracted factory in isolation. Raw source without a preset gets a new seed and restoration note. Downloaded JavaScript is executable code, not a safety boundary for another application.

### Batch optimization

[BatchingPreviewPanel.jsx](../src/components/BatchingPreviewPanel.jsx) controls a second worker view. Variants use consecutive seeds from the saved seed and seeded wrapper transforms. [batchOptimizer.js](../src/runtime/batchOptimizer.js) builds a separate static snapshot, consolidating compatible repeated draw objects into `InstancedMesh` groups after exact geometry/material comparison. It does not rewrite saved source, the original layout, or the instance specification.

Optimization is deliberately conservative: animation, custom hooks/shaders, unsupported object behavior, and order-dependent rendering can reject the whole layout. Textured, transparent, or otherwise ineligible meshes are not consolidated; supported passthrough content remains in the snapshot. Unsafe transforms and a bounded exact-comparison budget can also prevent consolidation. No useful match returns a reason and leaves the original available. The snapshot borrows geometry/materials, so its source must remain alive until the snapshot is released.

The worker measures before/after `renderer.info.render` calls and triangles with the same studio, camera, and resolution. In r169 these counts exclude the shadow pass but can include transmission work; they are not total GPU cost or a downstream engine guarantee. Export uses whichever layout is selected, without running the factory again.

## Verification boundaries

Relevant regression suites sit beside the service/runtime modules; browser checks exercise actual origin isolation, rendering, persistence, and downloads. Follow [Development](DEVELOPMENT.md) for commands and [Releasing](RELEASING.md) for clean-build rehearsal. Unit adapters in `src/test` are test-only and do not establish browser security by themselves.

Source inspection or mocked tests do not establish live-provider/account compatibility, release readiness, or a successful round trip through Blender/another engine. Verify those separately when in scope; do not infer them from a valid GLB header, a passing unit suite, or an old audit result.
