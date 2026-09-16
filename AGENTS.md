# Project instructions

Local 3D asset workbench: React 18, Vite 8, Three.js 0.169.0, plain JavaScript/JSX, Tailwind 3, Zod, and Vitest. The main prompt generates source through a local Node service using Anthropic or OpenAI. Generated/imported/restored source executes in an opaque-origin iframe's Worker; trusted curated generators run on the main thread.

Read [README](README.md) for setup, [User Guide](docs/USER_GUIDE.md) for workflows, [Development](docs/DEVELOPMENT.md) for tests, [Technical Overview](docs/TECHNICAL_OVERVIEW.md) for architecture, and [Isolated Runtime](docs/ISOLATED_RUNTIME.md) before changing execution or export boundaries. Current source wins over historical plans and transcripts.

## Commands

- `npm run dev` — loopback Vite app/API, normally port 5173.
- `npm test` — Vitest regression suite; run before every commit.
- `npm run build` — production output in `dist`.
- `npm start` — built app plus local API, normally port 4173.
- `npm run preview` — Vite preview with the shared local API.
- `npm run test:browser` — Playwright suite; its configuration starts a dedicated test server. See Development for prerequisites and scope.

Use the Node engine range in `package.json`. Keep shell instructions Windows/PowerShell-compatible and prefer forward slashes in configuration. Do not run paid model calls, publish, or start additional servers unless the task authorizes them. Saving Model settings does not make a paid connection-test request.

## Source map

- `src/api/generationService.js` — generation, spec, conversion, animation, edit, bounded repairs, progress. `claudeService.js` is only a compatibility re-export.
- `src/api/llmClient.js`, `server/api.js`, `server/providers.js`, `src/config/llmConfig.js` — local transport, sessions/CSRF/settings/routes, provider adapters, model precedence. Keys belong to the server, not browser persistence.
- `src/prompts/codeSystemPrompt.js`, `runtimeContract.js`, conversion/edit prompts — model-facing contracts; update regression tests when changing them.
- `src/api/creativeFailure.js`, `src/runtime/creativeCritic.js` — failure classification/retry policy and advisory geometry notes. Critic findings never gate commits or trigger retries.
- `src/runtime/CodeSandbox.js`, `isolated/{client,broker,transport,protocol,factory,worker,views}.js`, `server/workerBundle.js` — generated-code boundary. No production main-thread fallback; do not import worker execution modules into the host.
- `src/runtime/assetWorkspace.js`, `assetActions.js`, `src/hooks/useAssetWorkspace.js` — candidate builds, atomic document/runtime commits, parameter coalescing, cancellation, runtime leases. Keep orchestration here rather than growing `App.jsx`.
- `src/services/assetDocument.js`, `generationLibrary.js`, `assetSource.js` — immutable saved inputs, IndexedDB Library, source/preset import/export.
- `src/services/workspaceRecovery.js`, `recoveryController.js`, `src/hooks/useWorkspaceRecovery.js` — separate local recovery copy, explicit restore/discard, cross-tab conflict handling.
- `src/runtime/AssetFactory.js`, `src/generators/`, `src/services/builtinTemplates.js` — trusted curated path. `generatedStarters.js` indexes shipped source documents that still execute in isolation.
- `src/runtime/glbExport.js`, `exporter.js`, `batchOptimizer.js`, `src/components/BatchingPreviewPanel.jsx` — detached GLB snapshots, source/spec exports, conservative static instancing, measured layout preview.

## Invariants and cautions

- Never read, print, or commit `.env` or `.env.*`; `.env.example` is the sole permitted example. Never expose keys through logs, diffs, browser bundles, fixtures, or documentation. Do not restore browser-side provider credentials; Vite's `envPrefix: []` is intentional.
- Do not casually bump Three.js or its types. Saved assets, critic behavior, exports, and optimizer/rendering assumptions target r169; upgrading requires a deliberate migration and regression checks.
- Keep all generated source, callbacks, and Three objects worker-side. Origin/CSP enforcement is the boundary; regex checks and removed APIs are defense in depth. Host deadlines can terminate synchronous worker loops, but this is not a hard CPU/GPU/memory sandbox.
- Preserve explicit seed, params, schema, and texture inputs across operations. Legacy restoration notes must remain honest about missing inputs; do not silently substitute global textures. Seed persistence is not a guarantee of arbitrary-code determinism.
- Save/export/AI edits use the last committed document, not the unapplied editor draft. Failed/cancelled candidates must leave that document/runtime intact. Hold leases across asynchronous view/capture/export work and release only owned resources.
- Keep API errors/cancellation non-retryable. Code repair budgets are separate; do not add silent provider/model fallbacks or lower output caps without examining completion handling and task tests.
- Recovery is one browser-local safety net, not a Library backup. Do not overwrite another tab's newer recovery copy or auto-run a startup recovery candidate.
- Keep original and optimized batch layouts separate. Preserve conservative eligibility checks, borrowed-resource ownership, and rollback. Measured preview counts, instance-spec estimates, and downstream engine performance are different claims.
- GLB exports are static snapshots for callback animations, not animation baking. Downloaded source requires its dependencies/runtime helpers and is not safe merely because it was exported.
- Browser storage is origin/profile-specific. An empty Library also changes few-shot examples and can affect generation comparisons.

## Editing and verification

Match existing plain JS/JSX patterns, comment density, and exported-function JSDoc. Do not introduce TypeScript, new features, or tooling as incidental cleanup. No emojis in code or docs.

Preserve unrelated changes in a dirty worktree. Keep changes within assigned ownership; do not reset files, commit, or publish without authorization. Use focused diffs that cannot expose environment values. Exercise protocol/state/export tests for related changes and real-browser tests for browser-only claims; unit adapters are not a production execution path. Report what was actually checked and any unverified provider/browser/downstream behavior.
