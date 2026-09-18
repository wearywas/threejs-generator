# Codex connection (experimental)

[README](../README.md) · [User guide](USER_GUIDE.md)

Use your available Codex allowance to generate assets while keeping the complete ThreeJS Generator UI. No separate OpenAI/Anthropic API key is used in this mode. Account access, model availability and usage limits still apply; this is not unlimited or offline generation.

This is a local integration with [Codex App Server](https://developers.openai.com/es-419/docs/app-server), not a Codex plugin or a transfer of ChatGPT subscription credits to the OpenAI API. The local Node server starts a dedicated Codex process when you connect. You do not need an active assistant conversation to generate from the workbench.

## Requirements and compatibility

- Follow the [normal quick start](../README.md#quick-start): Node.js 24 recommended, npm, and a current desktop Chrome/Edge browser.
- Install Codex from an official OpenAI distribution and have a ChatGPT account with Codex access.
- Supply the absolute path to the actual native Codex CLI executable. The adapter does not search `PATH`, run shell wrappers (`.cmd`, `.ps1`), or accept a Desktop UI executable in its place.
- Supported CLI versions: **`0.155.0-alpha.2.6`** and **`0.155.0-alpha.9.2`**. These are CLI runtime versions, not Desktop's UI version. Other versions are intentionally rejected until their protocol and capability restrictions are reviewed.

Live verification currently covers Windows, those exact versions, and GPT-6 Astra. macOS/Linux Codex-provider behavior is not yet verified; ordinary API-key mode remains available. Do not downgrade an otherwise working Codex installation or bypass the version check just to enable this experiment.

## Start from a cloned repo in Codex Desktop

Open the cloned repository folder as a local project in Codex. You can ask the assistant:

> Follow docs/CODEX_SETUP.md to start this repo locally with the experimental Codex provider. Check Node and the installed native Codex runtime, use only a supported version, install dependencies with npm ci, and enable the two server settings for the launch. Leave my existing .env and normal Codex profile untouched. Open the app and stop at the managed sign-in step if needed. Do not generate an asset or change the compatibility allowlist.

You can also run the following steps yourself in a PowerShell terminal in the cloned folder. No plugin installation, manual `codex app-server` command, or copying authentication files is needed.

## 1. Locate and check the executable

For the Windows Desktop installation layout used in our tests, list candidates:

```powershell
Get-ChildItem -Path "$env:LOCALAPPDATA/OpenAI/Codex/bin/*/codex.exe" -File |
  Select-Object -ExpandProperty FullName
```

If this finds nothing, check whether an officially installed native CLI is on your terminal's path:

```powershell
Get-Command codex.exe -All -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty Source
```

If neither command finds it, stop and use the Codex setup request above to locate the native runtime in your official installation, or use API-key mode for now. An npm `codex.cmd`/`codex.ps1` launcher is not the required native binary; installing an arbitrary/latest package is not a guarantee of a supported runtime. If multiple candidates appear, do not assume the first is current. Check the intended installed binary, replacing the example path:

```powershell
$generatorCodex = 'C:/Users/YOUR_NAME/AppData/Local/OpenAI/Codex/bin/VERSION_DIRECTORY/codex.exe'
& $generatorCodex --version
```

Continue only if this prints one of the supported `codex-cli` versions above. Paths containing spaces are supported; keep the quotes and `&`.

## 2. Enable the provider and start the app

In the same PowerShell terminal:

```powershell
npm ci
$env:THREEJS_EXPERIMENTAL_CODEX = '1'
$env:THREEJS_CODEX_EXECUTABLE = $generatorCodex
npm run dev
```

Open the URL printed in the terminal, normally `http://127.0.0.1:5173`. Leave that terminal/server running. These environment settings apply only to this terminal and its child processes; repeat them in a new terminal.

For persistent setup, add just these two lines to your local root `.env`, replacing the path with your own. If the file already exists, preserve its contents; do not replace it with the example file. Restart the server after editing.

```dotenv
THREEJS_EXPERIMENTAL_CODEX=1
THREEJS_CODEX_EXECUTABLE="C:/absolute/path/to/codex.exe"
```

Use forward slashes in the `.env` path. Do not paste credentials, tokens, or sign-in URLs there. [`.env.example`](../.env.example) includes the disabled-by-default options; keep a populated `.env` out of Git.

`LLM_PROVIDER` still selects the initial **API** provider (`openai` or `anthropic`), not Codex. Enabling the experiment makes Codex available in the UI; it does not select it automatically or remove your API settings.

## 3. Connect and sign in

1. Open **Model settings**, choose **Codex (experimental)**, and select **Connect**.
2. If signed out, select **Sign in with ChatGPT**. Follow the official sign-in page; if it does not open, select **Continue ChatGPT sign-in**.
3. Return to the workbench and select **Refresh connection**.
4. Choose a model from the connected catalog and select **Save settings**. Confirm the header says **Codex (experimental)** before generating.

The sign-in uses a separate application-owned profile, so you may need to sign in once even if Codex Desktop is already signed in. A connection check discovers authentication/models without a generation request. Green means authentication was detected, not that a model request has been tested or that you have remaining allowance.

Now use **Generate**, **Add editable controls**, **AI Edit**, and **Add Animation** normally. Add Animation is available for assets with editable controls; use AI Edit for targeted animation instructions. Each model request, including repairs/retries, can consume allowance. Camera moves, sliders, Re-run, Library operations, exports and automatic batch optimization make no model request. Reported token counts are not a dollar quote or an allowance meter. Cancellation cannot recover usage already consumed.

When Codex is selected, the adapter does not read the project's provider keys or silently fall back to them. Switching to **OpenAI** or **Anthropic** uses that provider's separate API billing, including any configured server key.

**The selected provider/model is session-only.** Server restart or one hour idle can end that session. A new session starts on the API provider chosen by `LLM_PROVIDER` (Anthropic if unset, OpenAI in the example configuration), even though the separate Codex sign-in persists. Before your next generation, reconnect/select Codex, save settings, and check the header. This initial-provider reset is not a fallback after a failed Codex request.

## Next time, updating, and stopping

- With the two settings in `.env`, start with `npm run dev`. With terminal-only settings, set them again first. Reconnect/select Codex in Model settings when needed; managed sign-in normally persists, but account changes or expired authentication can require another sign-in.
- After pulling repo updates, stop the server, run `git pull --ff-only`, then `npm ci` and `npm run dev`. Git will stop rather than overwrite conflicting local changes. Keep `.env` private. Back up Library assets separately: Git does not contain them.
- For a built local app, use `npm run build` then `npm start` with the same server settings. The default URL is `http://127.0.0.1:4173`; that is a separate browser Library/recovery origin from port 5173. `npm run preview` also honors the settings.
- Stop with **Ctrl+C** in the server terminal. Run one Codex-enabled generator server at a time; different clones use the same app-owned profile for the same OS user.
- A Desktop update may replace the executable directory and change the CLI version. Save assets, stop the server, locate/check the new binary, and update your path if necessary. If its version is unsupported, wait for a compatibility update or explicitly use API-key mode. Do not edit the allowlist as a workaround.

## Privacy and profile separation

The connection passes the task prompt, relevant asset code, and selected example context to Codex. It uses ephemeral generation threads with restricted capabilities, not your current Codex conversation or repository as an agent workspace. Generated source still executes in the app's isolated browser Worker. This is not a general OS security sandbox.

The dedicated Windows profile is `%LOCALAPPDATA%/ThreeJSGenerator/codex-profile-experimental` (with a user-local fallback). Codex manages its authentication there. Do not share this directory, add personal instructions/plugins/configuration to it, or copy files from your normal Codex profile. It is separate from browser Library/recovery data. Turning off the feature hides the provider but does **not** sign out or erase this profile; the prototype has no in-app logout control.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Codex is absent from the provider list | Ensure `THREEJS_EXPERIMENTAL_CODEX=1` reached the running server, restart, and open that server's printed URL. Building the frontend alone does not enable it. |
| Missing executable | Supply an existing absolute native CLI path; check `--version`. A Desktop update may have removed the old directory. |
| Incompatible version or safety policy could not be verified | Use a supported official runtime with the untouched dedicated profile. Do not relax restrictions. Report the CLI version and safe error text, never credentials/raw profile dumps. |
| Signed out, pending sign-in, or no model available | Complete the managed sign-in, return and refresh. Check that your account has Codex/model access. Do not paste a callback URL or token into chat or an issue. |
| API-key authentication detected | This mode accepts managed ChatGPT sign-in only. Do not copy an API-key profile into it; use the normal OpenAI provider for API access. |
| Busy or connection unavailable | Let an active request finish/cancel, then refresh. If necessary, stop the generator server and restart; do not kill unrelated Codex processes. |
| Quota or model request failure | Check account access/allowance and the reported error. The app will not silently bill an API key instead. |
| Empty Library after changing URL/browser | Return to the original origin/profile and export a Library backup, then import it in the new one. |

For maintainer compatibility checks, see [Development](DEVELOPMENT.md#experimental-codex-provider).
