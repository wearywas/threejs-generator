# User guide

[Back to README](../README.md)

## First run

Follow the [quick start](../README.md#quick-start). No account, API key, or `.env` is needed to explore the shipped examples.

**Try an example** and **Browse templates** open Library's **Templates** tab. The gallery includes generated starters with editable controls and a separate collection of built-in procedural generators. Loading one does not call a model. Save a customized example to Library to create your own copy; the shipped example stays unchanged.

The prompt field always generates custom code. It does not try to fit your description into a template, and submitting a new prompt is not an edit to the displayed asset. Use **AI Edit** for that.

## Models, keys and costs

There are two connection types: **OpenAI/Anthropic API keys** with separate provider billing, and opt-in **Codex (experimental)** with managed ChatGPT sign-in and available Codex allowance. Codex setup requires a supported local runtime; follow [Codex setup](CODEX_SETUP.md), including the walkthrough for a repo opened in Codex Desktop. It retains the same asset workflow and never silently falls back to API keys.

For API-key mode, open **Model settings** in the header:

1. Choose **OpenAI** or **Anthropic**.
2. Use the model shown, or enter a model ID available to your API account. A blank model field uses the server's task defaults.
3. Enter a key for that provider and select **Save settings**.

In API-key mode, green means a key is configured for the selected provider, through the dialog or the server environment. Red means no key is configured. The masked saved-key indicator confirms a key is present without returning the stored secret to the browser. Saving settings does **not** make a paid test request or verify that the key/model works. In Codex mode, green means managed authentication was detected; it does not guarantee model access or remaining allowance.

App defaults are `claude-fable-5-1` for Anthropic and `gpt-6-astra` for OpenAI. These are configurable defaults, not a promise of provider availability. Use an accessible model ID if your provider rejects the default. There is no silent provider/model fallback or local inference backend.

### Session entry or persistent configuration

| Method | Lifetime | Where the key is kept |
| --- | --- | --- |
| Model settings | Until one hour idle, server restart, or **Forget session key** | Local Node server memory; briefly in the browser input/request, never saved in browser storage |
| Root `.env` | Loaded on each server start until removed | Your local configuration, outside the public source copy |
| Server process environment | While supplied by the launching terminal/system; terminal-only settings must be repeated in a new terminal | Local process configuration, outside browser storage |

For persistence, copy [`.env.example`](../.env.example) to a new `.env` in the project root, enter your keys, and restart. Do not overwrite existing configuration without reviewing it, and never commit/share a populated `.env`. Use `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` for new configuration.

`LLM_PROVIDER=anthropic` chooses the default for new sessions; set it to `openai` to start with OpenAI. Model settings can override the provider for the current session. Provider-wide and per-task model settings are documented in the example and [development guide](DEVELOPMENT.md#server-configuration).

A session key overrides the environment key for the same provider. **Forget session key** removes only that override: an environment key can keep the indicator green. To remove it, edit your local configuration and restart. Reconnect through Model settings after a session expires.

### Which actions use a model?

| Action | Model request? |
| --- | --- |
| Generate, AI Edit, Add editable controls, Add Animation | Yes |
| Load examples/library assets, move the camera, change sliders or textures, Re-run code | No |
| Save/recover/import/export, preview batching, Optimize layout | No |

AI actions send the prompt and relevant context/code to your selected provider through the local server. Saved examples may be selected as prompt context for later generations. Don't include private source or data you do not want sent to that provider. Library records and key configuration are separate.

Code failures can trigger bounded repair/regeneration requests, which may use additional API credits or Codex allowance according to the selected connection. Provider errors such as invalid keys, quota exhaustion, refusal or incomplete responses are surfaced without silently switching providers. **Cancel request** stops local work and attempts to cancel upstream work, but cannot recover usage already consumed. OpenAI/Anthropic API billing remains separate from ChatGPT/Claude subscriptions; choosing Codex does not convert a subscription into API credits. Token reports are not a dollar price or remaining-allowance meter.

## Generate, edit and add controls

Start with an object, style and important construction details. For example: “A small timber cottage with a steep roof, a sheltered porch and four evenly spaced posts.” Inspect results from several angles.

- **AI Edit:** describe a change to the current asset, including what to preserve.
- **Add editable controls:** optionally request controls such as floor count, roof pitch or window opacity. Leave guidance blank to let the model choose. This is an AI rewrite, so review the converted result.
- **Procedural Parameters:** sliders and color inputs rebuild locally. Click editable numeric values for precision. Complex assets can take time; rapid edits are coalesced, and the last rendered model/camera stays visible while the replacement is prepared.
- **Generated Code → Edit / Re-run:** edits are drafts until a successful Re-run. **Copy draft** copies unapplied text; save/export/AI operations use the last working version.
- **New variation:** picks another seed. Other edits preserve the seed. Repeatability still depends on generated code actually using it rather than time or uncontrolled randomness.

**Geometry hints** are local heuristics, not proof that a mesh is good or bad. They do not trigger paid retries or reject results. **Uncap Tri Count** raises the execution budget; it does not make complex geometry fast or unlimited.

## Save, recover and move between computers

| Feature | Purpose |
| --- | --- |
| Local recovery | One working workspace: last successful asset and unapplied code draft. Choose **Restore workspace** after reopening; no AI request is made. |
| Save to Library | A named copy with source/specification, seed, controls, values and texture inputs, plus a thumbnail when available. |
| Library → Export | A JSON backup of saved assets for another browser/computer. It does not back up an unapplied workspace draft or the shipped catalog. |

Recovery and Library use browser storage for the current origin and profile. `localhost`, `127.0.0.1`, different ports, and another browser/profile do not share it. Clearing site data or using temporary/private browsing can remove it. Copying the repository does not copy the Library.

Watch for **Recovery saved in this browser**. If recovery reports a storage error or another-tab conflict, save/download the working asset instead of assuming it is protected. If you also have unapplied edits, use **Copy draft** and paste them into a separate text/code file: normal saves/downloads exclude that draft. **Discard recovery** deletes the offered recovery copy, not named Library entries. Recovery is not version history; keep named copies or downloads before experimenting.

Use Library **Export** on the old machine and **Import** on the new one. Generated `.js` preset downloads also import individually. Older raw function files can load, but lack the original saved controls/seed/texture data. Old JSON backups are accepted where their records satisfy the current contract; there is no legacy main-thread execution fallback.

## Choose an export

| Action | Contents | Best use |
| --- | --- | --- |
| Copy source / Copy draft | Editor function text only | Inspect/discuss code; not a saved configuration |
| Download .js (generated asset) | Last working function, seed, parameters, controls, texture inputs and `createSavedAsset()` helper | Re-import here or integrate into Three.js |
| Download .js (built-in generator) | Template specification and runtime usage example | Use with this repository's generator runtime; not a standalone generated preset |
| Download GLB | Current asset's geometry/materials | Blender and other glTF tools |
| Download preview / optimized GLB | Selected full batching arrangement, including instancing | Repeated placements |
| Download batchable JS | Original source plus an instance specification for a compatible renderer | Custom integration, not the optimized displayed arrangement |

GLB does not carry JavaScript or parameter sliders. Callback animation (`update()`/`tick()`) exports as a **static snapshot** of the worker's current pose when the export is processed, not baked tracks. There is no timeline or exact-frame picker. Custom visual effects may not translate exactly between renderers. Flat shading is prepared on an export-only copy; the live asset is not changed.

GLB and generated `.js` names use up to eight prompt words, capped at 60 characters for the base name. Your browser handles duplicate-name suffixes such as `(1)`.

In Blender use **File → Import → glTF 2.0 (.glb/.gltf)**. Compare materials and placement; runtime Three.js effects are not Blender shaders. Instancing support varies by importer, so keep the ordinary asset export as well as optimized layouts.

### Use generated JavaScript in your own project

The download is an ES module, not a complete page or npm bundle:

```js
import * as THREE from 'three'
import { createSavedAsset } from './my-asset.js'

const asset = createSavedAsset(THREE)
scene.add(asset.root) // scene belongs to your application
```

Optional overrides use `createSavedAsset(THREE, { seed: 42, params: { width: 2 } }, addons)`. The original `createAsset` and `assetPreset` are also exported. Supply Three.js and any required addons/helpers; they are not bundled. Check the source's notes/return contract for animation and disposal. This recreates factory inputs, not camera or animation time. Running downloaded JavaScript elsewhere does not inherit this app's isolation.

## Batching and automatic optimization

For a supported generated-code asset, open **Export → Advanced: batching → Prepare for Batching**.

1. Set grid size, spacing, rotation jitter and scale jitter. Placements are separately seeded variants using the asset's current parameter inputs. Use **1×1** for one asset.
2. **Download preview GLB** exports the arrangement without studio lights or guides.
3. Select **Optimize layout** to consolidate exactly compatible opaque draw objects. It makes no model request, removes no triangles and does not rewrite the original source.
4. Toggle **Original / Optimized** at the same camera and inspect the result. **Download optimized GLB** uses `.optimized.layout.glb`; the original uses `.layout.glb`.

Counters are measured at the optimization camera. They include studio guides and transmission passes but exclude shadows. They are not live FPS measurements or a guarantee of speedup. **Spec estimate @ 100 placements** is a separate estimate for a compatible renderer, not this measurement.

Animation, unsafe custom behavior and order-dependent rendering can leave the whole layout original with an explanation. Transparent/textured and other ineligible parts are not consolidated. A safe asset may show little benefit when geometry/materials differ between parts. Larger batches reduce per-part editability and culling granularity. Arrangement edits reset the comparison; optimize again afterward. The `.batchable.js` export remains the original specification/source, not this optimization result.

**Batchable JS is an integration format, not a ready-to-run viewer.** It exposes `instanceSpec` and a default export containing the specification and original factory. A custom renderer must implement the [version-1 instance schema](../src/schemas/instanceSpec.js), including geometry/material definitions, transforms and the instance generator. This repository does not ship a standalone consumer for that exported format. Grid size, spacing and jitter settings are not saved in it; use the layout GLB when you want the arrangement shown in the browser.

## Troubleshooting

- **Green key indicator, failed generation:** in API-key mode, verify provider, model ID, API access and billing. Green means configured, not authenticated. For Codex, see [connection troubleshooting](CODEX_SETUP.md#troubleshooting). Environment changes need a server restart.
- **Empty Library after changing ports/computers:** return to the old origin/profile, export a JSON backup, then import it at the new origin.
- **Old model stays visible during an edit:** replacements are prepared separately. Keeping the old model after a failure/cancellation is intentional.
- **Export ignores code edits:** Re-run successfully first. Use **Copy draft** for unapplied text.
- **Preview fails/stops:** simplify the asset, undo risky source edits, or restore a saved copy. Raising timeouts does not make unsupported DOM/network/import operations or excessive resource use safe.
- **Unsupported browser:** current desktop Chrome/Edge are the tested target; generated previews require OffscreenCanvas and ImageBitmap. There is no main-thread compatibility mode.
- **`npm start` shows “Not found”:** run `npm run build` first and restart from the project folder. Keep the server running; opening `index.html` directly is unsupported.

See [runtime safety](ISOLATED_RUNTIME.md) for limits and [development](DEVELOPMENT.md) for install/test commands.
