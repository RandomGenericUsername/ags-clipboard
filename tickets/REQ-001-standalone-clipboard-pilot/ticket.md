---
id: REQ-001
title: "Extract the clipboard overlay into the standalone ags-clipboard pilot"
kind: requirement
status: done
lane: 3
links:
  openspec: none
  bmad: none
worktree: none
branch: main
---

# Extract the clipboard overlay into the standalone ags-clipboard pilot

## Requirement

Create `ags-clipboard` from the `ags-apps` v0.5.0 clipboard app, with the repo
root as the app package and the full identity rename. Ship the real live
`palette-refresh`, the `clipboard` runtime data namespace, the standalone dev
flow and the frozen `templates/ags-app/` fixture. This is the REQ-009 pilot; it
does not provision, cut over or push.

## Acceptance

- [x] `app.tsx` is at the repo root; there is no app subdirectory.
- [x] Identity is `app/instance=clipboard`, `configDir=ags-clipboard`, window
      `clipboard-window`, launcher `clipboard-ui`, keybind description
      “Open clipboard history”, with no retired name in code/config.
- [x] `app.manifest.json` is the `clipboard` / `ags-clipboard` / `live` /
      no-unsaved-state tuple and agrees with `app.tsx`.
- [x] The app reads `$XDG_STATE_HOME/clipboard/history.json` and the runtime
      `clipboard` image cache; no old data path is read.
- [x] `palette-refresh` is a real refresh through the platform v0.3.0 helper:
      clear token/texture caches, re-apply the Theme pointer, rebuild the search
      icon and cards, preserve overlay visibility/query/selection/clipboard
      state; idempotent by appearance hash; one JSON-string response.
- [x] `AGENTS.md`, `tickets/LIFECYCLE|INDEX|_template`, worktree guard,
      Makefile, CI, README, tests and `templates/ags-app/` are present and the
      platform template-conformance gate passes.
- [x] Local gates pass: `make test`, `make conformance`, `make drift`,
      `make typecheck`, `make bundle` (or `ags bundle`).
- [x] Annotated tag `v0.1.0` is created after the gates pass; nothing is pushed.

## Evidence

- `make gates` → exit 0, 13 s warm wall (test + conformance + drift + bundle +
  typecheck):
  - `make test` → 11/11 pass (`tests/unit.test.mjs`);
  - `make conformance` → 13/13 pass (`tests/app-contract.test.mjs`), including
    the platform `checkAppRepo` template gate and the manifest identity;
  - `make drift` → all checks passed (`tests/event-contract-drift.mjs`);
  - `make bundle` → `build/ags-clipboard.js`, 752076 bytes;
  - `make typecheck` → 0 errors in the ags-clipboard tree (27 tolerated
    `/usr/share/ags/js` errors, 0 platform errors).
- Real refresh evidence: `lib/palette-refresh.ts` executes the same handler
  `app.tsx` registers; `tests/unit.test.mjs` proves one JSON-string response,
  same-hash no-op, and retryable failure. `lib/appearance.ts` orders
  clear → search icon → cards. `ui/ItemCard.tsx#clearVisualCaches` clears
  `tokenCache` and `textureCache`; `ui/ClipboardWindow.tsx#rebuildSearchIcon`
  swaps only the static glyph and `rebuild()` re-reads no history, query,
  selection source or visibility.
- Namespace evidence: `lib/history.ts#historyPath` →
  `$XDG_STATE_HOME/clipboard/history.json`, matching
  `dotfiles-runtime/src/runtime/adapters/json_history_store.py` and the
  migration in `clipboard_migration.py`.
- Live handler smoke (real desktop session): `ags run -d .` → `ags list`
  includes `clipboard`; `ags request palette-refresh live-smoke-hash -i
  clipboard` → `{"ok":true}` twice (same-hash idempotent); `ags request toggle`
  and `hide` → `ok`; `ags quit -i clipboard` leaves no process.
- Template evidence: a throwaway copy of `templates/ags-app/` with every
  `template.json` token replaced passed `make test` (2/2) and
  `make conformance` (2/2) against the local v0.3.0 tuple.
- The conformance gate's retired-name scan (excluding generated/local trees)
  reports no matches.

## Dependencies

- `ags-apps` v0.5.0 source and the REQ-008/REQ-009 contract.
- `ags-platform` v0.3.0 and `contracts` v0.3.0 (local-only tags).
- `dotfiles-runtime` REQ-002 clipboard namespace + one-time migration.
