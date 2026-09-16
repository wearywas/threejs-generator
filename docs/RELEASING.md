# Release checklist

This is a source-distributed local application. Publishing the repository is not permission to deploy its API as a multi-user public service.

## Prepare the source candidate

- Freeze the candidate's functionality; fix release blockers rather than adding features.
- Check README and reference docs against current UI labels, commands, configuration and export behavior.
- Include source, server, public examples/notices, tests, development scripts, configs, lockfile, license, project-only agent guidance and public documentation.
- Exclude `.git` when starting a separate clean-history repository; also exclude populated `.env*`, dependencies, builds, logs, browser/test output, personal agent settings, private Library backups and historical planning/transcript files. `.env.example` is the only environment file to include.
- Use an explicit file/directory allowlist, inspect the result, and scan the actual candidate for credential patterns and personal paths. `.gitignore` alone is not a publication review.
- Preserve third-party notices in `public/` and the generated `dist/third-party-licenses.txt` when distributing built copies. Do not relabel dependency licenses as MIT.
- Inspect generated starter source and media provenance before publishing; do not include unreviewed user Library contents.

## Rehearse from a fresh copy

In a new source-only folder, without a populated `.env`:

```sh
npm ci
npm audit
npm test
npm run build
npm run test:browser:install
npm run test:browser
npm start
```

Open `http://127.0.0.1:4173` in a fresh browser profile/context. Confirm:

- No key is configured, Library starts empty and examples work without provider calls.
- Load a generated starter, change controls, save/reload it and export/re-import a `.js` preset.
- Local recovery restores the working asset/draft without an AI request; exporting Library JSON produces a portable backup.
- Original and optimized batch layouts compare correctly and export the selected GLB. Check the measured numbers without presenting draw-call reduction as an FPS guarantee.
- Import both original and optimized GLBs into Blender; compare layout, dimensions, materials and instance handling. Use a separate Blender process/file so existing work is not overwritten.
- Test paid generation separately only with deliberate authorization and a limited budget; never add a real key to CI or capture it in a demo.

Record the candidate version/hash, OS, Node/browser/Blender versions, exact command outcomes, audit date and remaining limitations. A local Windows run does not prove Linux CI, every browser or every GLB importer works.

## Demo and publication

1. Follow the README on another machine to catch undocumented setup assumptions.
2. Record a short workflow: prompt → generated asset → guided editable controls → a few local edits → GLB in Blender. A brief batching comparison is optional. Show a representative successful result, not a guarantee that every prompt works.
3. Keep keys, account details and private Library items out of the recording. Describe any time compression.
4. Add the final video/screenshot and the real repository URL only after they exist. Verify relative links and media paths in the public candidate.
5. Recheck the exact files being staged, rerun verification if code/dependencies changed, and publish only after approval. For a clean-history launch, initialize the reviewed candidate as a new repository rather than changing the private repository's visibility.
6. Review actual CI results after the push. Record known limitations and invite reproducible issue reports without requesting secrets.

Local inference, LLM-assisted optimization and broader hosting are follow-up projects, not prerequisites for the first release.
