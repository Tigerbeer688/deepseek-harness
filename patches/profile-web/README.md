# profile-web node_modules patch archive

English | [中文](README.zh.md)

Manual patches for the DSH web profile (default `C:/Users/Administrator/.dsh/profiles/web`) dependency tree. Every `pnpm install` inside the profile restores the original files, so the patches must be reapplied.

## Usage

```sh
node patches/profile-web/apply.mjs --check    # check only
node patches/profile-web/apply.mjs            # apply patches
node patches/profile-web/apply.mjs --shims    # also restore the file: shim packages
node patches/profile-web/verify-source-kinds.mjs [profileRoot]
```

`apply.mjs` runs `git apply -p1` from the root of the package each patch belongs to; an already-applied patch passes the reverse check and reports `ALREADY` without failing. `--profile` points at another profile root.

## Patch overview

| Patch | Effect |
| --- | --- |
| `@opencode2dsh__dsh-plugin@0.3.3.patch` | `lib/index.js`: `DEFAULT_CONTEXT_WINDOW` 262144→1048576, `DEFAULT_MAX_TOKENS` 32768→65536, `toPiModel` adds `compat.maxTokensField: "max_tokens"` (fixes mimo free-model output token truncation). `lib/catalog-4gwZT9We.js`: the models.dev and Zen model lists switch to `node:https` (the built-in fetch returns empty response headers in this environment). |
| `@earendil-works__pi-ai@0.82.1.patch` | `dist/api/openai-completions.js`: injects `globalThis.__dshUndiciFetch` into the OpenAI client (Node 22.18's built-in undici returns empty response headers or a binary body for external HTTPS). |
| `dsh-free-search@0.4.35.patch` | `lib/index.js`: removes the `SettingsProvider` import (the service was removed from the Client face in 0.1.7, and the import caused load failure). |
| `dsh-gungnir@0.2.1.patch` | `dist/index.js` and `dist/surfaces.js`: change steering/followup `source.kind` from `'plugin'` to `'plugin:gungnir'`. |
| `dsh-loop-continue@0.2.0.patch` | `lib/index.js`: change `source.kind` to the `plugin:${name}` template. |
| `dsh-answer-reviewer@0.7.2.patch` | `lib/review.js`: change `source.kind` to the `plugin:${PLUGIN_NAME}` template. Uninstalled from the profile; the patch is archived only, so apply it manually after reinstalling the package. |
| `dsh-quality-review@0.1.0.patch` | `lib/index.js`: change `source.kind` to `'plugin:quality-review'` and add an `id` to steer messages. Depends on `github:CAI-MH/dsh-quality-review` @ `7c5a67d`. Uninstalled from the profile; the patch is archived only, so apply it manually after reinstalling the package. |
| `dsh-soul@0.5.0.patch` | `index.mjs`: change `source.kind` to `'plugin:dsh-soul'`. Uninstalled from the profile; the patch is archived only, so apply it manually after reinstalling the package. |
| `dsh-engram@0.4.0.patch` | `lib/context-gc.js`: change `source.kind` to `'plugin:dsh-engram'`. |

## shims/

Full snapshots of the profile root's `file:` dependencies (not diffs; the source is the installed state):

- `settings-scope-shim` (`dsh-settings-scope-shim`): restores the `settingsScope` service that 0.1.7 removed from the Client face, so cards for plugins such as dsh-loop-continue can activate.
- `fetch-shim` (`dsh-fetch-shim`): replaces Node 22.18's built-in `globalThis.fetch` with the profile's undici 8.11 and publishes `globalThis.__dshUndiciFetch`.

## Build and verification

- `build.mjs`: normalizes harvest's absolute-path diffs into package-relative `a/` `b/` headers and merges them per package. Usage: `node build.mjs [diffsDir]`.
- `harvest.mjs`: runs `npm pack` to pull the original packages and generate diffs (requires network).
- `manifest.json`: the package manifest consumed by `apply.mjs`.
- `verify-source-kinds.mjs`: verifies the 7 source-kind markers and scans the whole tree for legacy `kind: 'plugin'` literals (expects 0).
