# Anthropic buffered streaming implementation plan

**Goal:** Avoid waiting silently for an entire Anthropic generation before receiving HTTP headers, while keeping the browser's complete-response contract.

**Design:** Request Anthropic SSE using the existing fetch transport. Consume and validate events on the server, retain only visible text and response metadata, and release a result only after a completed message. Keep OpenAI's request shape, model choices, token budgets, retry policy and worker execution boundary unchanged. Distinguish provider timeouts from cancellation and other connection failures without exposing upstream error text.

**References:** [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [long requests](https://platform.claude.com/docs/en/api/errors#long-requests), existing server providers and API contracts.

## Implementation

- [x] Add failing regression tests for streamed text/usage, fragmented UTF-8 and SSE framing, completion gating, interrupted/malformed streams, refusal/token limits, safe errors, timeout classification and cancellation.
- [x] Implement `server/anthropicStream.js` with bounded event/text buffers and explicit reader cleanup. Share safe error definitions in `server/modelErrors.js`; preserve the existing `ModelError` export from providers.
- [x] Update `server/providers.js` to request Anthropic streaming and retain existing normalized output checks. Give the API deadline an explicit timeout reason and extend it to 15 minutes per provider call.
- [x] Verify through a local HTTP provider fixture that SSE headers arrive before completion and that the local API does not send partial code. This confirms the transport behavior; the original failure's exact cause remains unconfirmed.
- [x] Update transport documentation, run focused/full unit checks and production build, then independent code review.

## Verification results

Streaming regression tests failed against the original JSON-only transport, then passed after implementation. The deadline regression first reproduced `request_cancelled`, then passed with `provider_timeout`. Independent review identified that conflicting completion reasons could overwrite a refusal or token limit; both added regressions failed before the guard and passed afterward. Repeated identical reasons and usage-only deltas remain accepted.

- Focused server checks: 68 tests passed.
- Full unit suite after the review fix: 862 tests passed across 74 files.
- Production build after the review fix: passed.
- Offline browser suite: 29 tests passed. Run before the final completion-reason guard; its regressions are covered by the subsequent server and full unit runs.
- Whitespace validation: passed.

The user confirmed a successful Fable generation taking more than five minutes, then requested the longer deadline. The deadline regression failed at the former six-minute setting and passed at 15 minutes. The full unit suite and production build passed again before committing.

No paid API requests were made by the agent. No model fallbacks, automatic retries, credential logging or dependency upgrades were added. Live-provider confirmation above is user-reported and separate from the automated fixture tests.
