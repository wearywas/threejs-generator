# Development

[README](../README.md) · [Architecture](TECHNICAL_OVERVIEW.md) · [Runtime safety](ISOLATED_RUNTIME.md)

## Requirements and commands

Node 24 is recommended. `package.json` supports Node `^20.19.0 || ^22.12.0 || >=24.0.0`. Use npm and the committed lockfile; plain JavaScript/JSX is intentional. Desktop Chrome and Edge are the tested browser targets.

```sh
npm ci
npm run dev
```

Development serves the app and local API at `http://127.0.0.1:5173`. Vite can choose another port if occupied; use the terminal's URL. For the production server:

```sh
npm run build
npm start
```

Production uses `http://127.0.0.1:4173` by default; `PORT` can override it. Both servers bind to loopback. The build is not a standalone static-host deployment: it needs the local API server. Changing ports/hostnames changes browser Library/recovery storage.

## Tests

```sh
npm test
npm run test:browser:install
npm run test:browser
npm audit
```

Vitest covers source contracts, state/lifecycle, persistence, provider errors, geometry, exports and build hygiene. Playwright builds an isolated production copy into a temporary directory, starts its own no-key server on `127.0.0.1:5198`, and uses fresh browser contexts. Keep that port free. Its server disables outbound provider requests; do not point the suite at your live workspace. Browser diagnostics are written to ignored `test-results/` and `playwright-report/` folders. On Linux, browser system dependencies may also require `npx playwright install --with-deps chromium`.

CI runs install, unit tests, build and browser tests on Windows and Linux with Node 24. Treat CI execution results as separate evidence from a local Windows run. The `scripts/smoke-*.mjs` and `src/components/*.browser.mjs` utilities are focused development probes, not substitutes for the main suite; read their server/profile assumptions before using them.

## Contribution conventions

- Keep changes focused and add regression tests for behavior changes. Use the existing JS/JSX, React and Tailwind/CSS conventions; there is no lint script.
- Do not bypass worker isolation to support generated code. Preserve cancellation, bounded RPC, resource cleanup and last-good-asset behavior.
- Keep model-selection/request behavior explicit. Never silently switch providers or execute incomplete/refused output.
- Do not casually upgrade Three.js from r169: generators, saved assets, exports and visual tests depend on its semantics.
- Prompt changes need their content-regression tests and representative visual checks. Keep the geometric critic advisory.
- Preserve source/seed/params/textures together. Sliders, Library, recovery and downloads must agree on the committed asset.
- Never commit keys, `.env`, browser backups, generated build artifacts or personal model outputs. Use synthetic credentials in tests. Redact prompt/private code from shared diagnostics.

Dependency maintenance must keep the Monaco DOMPurify override **and** vendored-import alias until both upstream paths are fixed and re-audited. Build tests verify the local sanitizer and license output; changing a package can require refreshing supplemental notices. Keep [third-party notices](../public/THIRD_PARTY_NOTICES.txt) and `public/licenses/` in distributions.

## Server configuration

Use [`.env.example`](../.env.example) for an optional root `.env`. Production loads the root file; development also uses Vite's mode-specific env loading. Process variables override loaded values. Restart after changes; never expose a key with browser `import.meta.env` or commit it.

| Variable | Meaning |
| --- | --- |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Optional server-side defaults. A session key overrides its provider's environment key. |
| `LLM_PROVIDER` | Initial provider for new sessions: `anthropic` or `openai`; defaults to Anthropic. |
| `ANTHROPIC_MODEL`, `OPENAI_MODEL` | Provider-wide model defaults. |
| `ANTHROPIC_MODEL_TASK`, `OPENAI_MODEL_TASK` | Replace `TASK` with `SPEC`, `CREATIVE`, `CONVERT`, `ANIMATE` or `EDIT`. |
| `LLM_ALLOWED_ORIGINS` | Optional comma-separated exact local HTTP origins for companion clients. Empty by default. |
| `PORT` | `npm start` port, default 4173. Does not configure the Vite development port. |

A session model override wins over task defaults. For Anthropic, precedence is session override → unprefixed task → unprefixed provider-wide → legacy `VITE_ANTHROPIC_MODEL_TASK` → legacy `VITE_ANTHROPIC_MODEL` → built-in default. OpenAI uses the same order without legacy names. `ANTHROPIC_API_KEY` wins over legacy `VITE_ANTHROPIC_API_KEY`. Legacy names are accepted server-side only; `envPrefix: []` prevents automatic Vite browser bundling. Rebuilding cannot revoke secrets exposed in older shared builds; affected keys need rotation.

## Local API integration

The development and production servers share `server/api.js`. This is a local integration surface, not a public hosted service. A companion origin must be explicitly configured, for example `LLM_ALLOWED_ORIGINS=http://127.0.0.1:5274`. Use exact origins without paths/trailing slashes; `*` and remote hosts are not supported. Use the same hostname on both apps so the `SameSite=Strict` session cookie works.

1. `GET /api/session` with `credentials: 'include'` establishes an HttpOnly session cookie and returns `csrfToken` and non-secret configuration status.
2. Send POSTs with `credentials: 'include'`, `Content-Type: application/json` and `X-CSRF-Token`. The browser supplies `Origin`; loopback Host and exact Origin are checked.
3. `POST /api/settings` selects `{ provider, model?, apiKey?, forgetKey? }`.
4. `POST /api/generate` with `{ prompt }` performs a **paid** creative generation and returns source. Execution and batching remain client responsibilities.

After session expiry, repeat the handshake and settings selection. `GET /api/health`, `/api/generators` and `/api/generator/:name/schema` provide read-only discovery. `POST /api/asset/code` returns 501 after authentication: built-in source export has no standalone contract. Retired filesystem-save/list routes from the prototype are not supported. Use the current code/tests for additional internal request contracts rather than historical transcript examples.

## Release preparation

Follow [the release checklist](RELEASING.md). The MIT project license does not replace dependencies' own notices. A clean advisory scan is useful evidence, not a security guarantee. No code or tests can guarantee every generated model is visually correct or safe for arbitrary resource usage.
