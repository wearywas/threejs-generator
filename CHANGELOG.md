# Changelog

## Unreleased — first public release

- Unified prompt-to-code workflow with configurable OpenAI and Anthropic providers through a loopback Node server.
- Isolated generated-code execution, rendering, analysis and GLB export, with bounded execution and cancellation.
- Generated starters and maintained procedural templates available without an API key.
- AI editing, animation requests and guided conversion to editable controls; local parameter updates preserve the last working preview and camera.
- Saved asset inputs, named Library copies, portable JSON backups, `.js` preset import/export and local workspace recovery.
- Clear separation between copying editor source/drafts and downloading the last working source with saved inputs.
- Prompt-based download names and export-only preparation for flat-shaded GLB geometry.
- Repeated-placement previews, original/optimized layout comparison, automatic compatible-instance consolidation and selected-layout GLB export.
- Local geometric advice remains advisory; it does not gate generations or trigger paid quality retries.
- Keyboard-aware dialogs, first-run guidance, model/key status and responsive workbench layout.
- Automated unit, built-app browser and release-build checks, plus MIT project licensing and third-party notices.

This changelog starts with the public-release baseline. The pre-release prototype's internal chronology and retired companion endpoints are not a supported API history. See [development](docs/DEVELOPMENT.md) for the current integration contract.
