---
id: REQ-007
title: "Consume Generations v3 (contracts v0.8.0 / ags-platform v1.0.0)"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-007/
branch: ticket/REQ-007-generations-v3
---

# Consume Generations v3 (contracts v0.8.0 / ags-platform v1.0.0)

## Requirement

Move the clipboard app from the v2 appearance transport to Generations v3
without adding a second request surface or changing the overlay:

- `app.tsx` keeps one module-level
  `createAppearance({ configDir: "ags-clipboard" })`, one `appearance.apply()`
  in `main()`, and one
  `createAppearanceRefreshHandler(appearance, work)`.
- The single `requestHandler` dispatches the v3 command
  `APPEARANCE_REFRESH_COMMAND` (`appearance-refresh <genHash>`); the retired
  `palette-refresh` command and its `{"ok":true}` acknowledgement are gone. No
  new command is added.
- `work` returns the v3 `{ status: "applied" }` result after the existing
  non-destructive clipboard rebuild, so the platform helper can answer
  `{"applied":"<genHash>"}`. A void work result is invalid in v1.0.0.
- The platform adapter reads only
  `$XDG_STATE_HOME/dotfiles/current/manifest.json` and
  `current/appearance/ags-clipboard.css` plus `tokens.json`; the app does not
  read the retired config-home convenience link or any skin path.
- The bundled `style.css` glass fallback, the TSX-owned
  `layout.ags-clipboard.card-width` token (fallback `260`, `peek()` for GTK),
  selectors, geometry, gestures and behavior do not change.
- The local pins move to `ags-platform` `v1.0.0` / `contracts` `v0.8.0` in the
  Makefile, CI and documentation. Gates run with the local overrides
  `AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform` and
  `CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts`.

## Acceptance

- [x] `app.tsx` imports `APPEARANCE_REFRESH_COMMAND` from
      `ags-platform/ports/appearance-refresh`, dispatches it in the one
      `requestHandler`, and retains `createAppearance`, `appearance.apply()`
      and `createAppearanceRefreshHandler(appearance, work)`.
- [x] The `work` callback returns `{ status: "applied" }` after
      `refreshClipboardAppearance()`; there is no `PALETTE_REFRESH_COMMAND`,
      `ports/palette-refresh` import or `{"ok":true}` ack in the app source.
- [x] Source tests assert the v3 `appearance-refresh <genHash>` request and the
      generation-bound `{"applied":"<genHash>"}` response; no executed app test
      asserts the retired `palette-refresh`/`{ ok: true }` shape.
- [x] `Makefile`, `.github/workflows/ci.yml` and the README/AGENTS/CHANGELOG
      pins state `ags-platform` `v1.0.0` / `contracts` `v0.8.0`.
- [x] `style.css` remains the bundled glass fallback; the layout token and all
      overlay behavior are unchanged.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch merges fast-forward to `main`, the next minor tag is created,
      and `main` plus the tag are pushed.

## Implementation

- `app.tsx`: the appearance import now comes from
  `ags-platform/ports/appearance-refresh`; the single `requestHandler`
  dispatches `APPEARANCE_REFRESH_COMMAND` (`appearance-refresh <genHash>`) first
  and the retired `palette-refresh` no longer routes anywhere. The one
  module-level `createAppearance({ configDir: "ags-clipboard" })`,
  `appearance.apply()` and `createAppearanceRefreshHandler(appearance, work)`
  are unchanged. `work` still calls `refreshClipboardAppearance()` and now
  returns `{ status: "applied" }`, which the v1.0.0 helper requires before it
  can answer `{"applied":"<genHash>"}`.
- `Makefile` / `.github/workflows/ci.yml`: pins move to `ags-platform`
  `v1.0.0` / `contracts` `v0.8.0` (local `AGS_PLATFORM_DEV` /
  `CONTRACTS_ROOT` overrides stay authoritative).
- `tests/unit.test.mjs`: adds executed v3 handler tests. One applies a 64-hex
  requested generation through a fake `applyGeneration` and asserts exactly one
  `{"applied":"<genHash>"}` response; one asserts the retired
  `palette-refresh` command is a terminal failure and applies nothing.
- `tests/app-contract.test.mjs` and
  `tests/validation/appearance-migration.test.mjs`: pin
  `APPEARANCE_REFRESH_COMMAND`, the single dispatch, the explicit applied work
  result and the v1.0.0/v0.8.0 tuple, and reject `PALETTE_REFRESH_COMMAND`,
  `ports/palette-refresh` and the v2 `{"ok":true}` ack.
- `README.md`, `AGENTS.md`, `CHANGELOG.md`, `lib/appearance.ts`,
  `ui/ClipboardWindow.tsx` and `ui/ItemCard.tsx`: describe the v3
  `current/manifest.json` + `current/appearance/ags-clipboard.css` reads,
  `appearance-refresh <genHash>` and the generation-bound response union.

## Evidence

### Source checks

- `app.tsx:5-8` imports `APPEARANCE_REFRESH_COMMAND` and
  `createAppearanceRefreshHandler`; `app.tsx:24` creates the one app-scoped
  appearance; `app.tsx:28` keeps `layout.ags-clipboard.card-width` with
  fallback `260`; `app.tsx:39-42` wires
  `createAppearanceRefreshHandler(appearance, work)` and returns
  `{ status: "applied" }`; `app.tsx:74-77` dispatches only
  `APPEARANCE_REFRESH_COMMAND`; `app.tsx:89` calls `appearance.apply()`.
- `tests/unit.test.mjs:46-63` executes the v3 handler against a fake
  `applyGeneration` and asserts the exact `{ applied: GEN_HASH }` response;
  `tests/unit.test.mjs:66-84` asserts `palette-refresh` fails terminally without
  applying a generation.
- `tests/app-contract.test.mjs:259-264` pins the v1.0.0/v0.8.0 tuple;
  `:281-294` pins the v3 command, rejects the v2 import/ack, and requires the
  applied work result. `tests/validation/appearance-migration.test.mjs:137-161`
  asserts the same wiring on the stripped app source.
- `style.css:11-12` keeps `alpha(@surface, 0.92)` and `style.css:73` keeps
  `alpha(@surface, 0.45)`; the layout-token and widget-order code paths are
  unchanged.
- Local tuple: `git -C ../ags-platform describe --tags --exact-match` →
  `v1.0.0`; `git -C ../contracts describe --tags --exact-match` → `v0.8.0`.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-clipboard-req007-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 13/13 pass (unit + theme roles + appearance migration) |
| `make conformance` | 13/13 pass, including the platform `checkAppRepo` template gate and the v1.0.0 / v0.8.0 pin |
| `make drift` | all checks passed against contracts v0.8.0 |
| `make bundle` | `build/ags-clipboard.js`, 954,576 bytes |
| `make typecheck` | 0 errors in the ags-clipboard tree (27 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Environment note: the first `make gates` run in the fresh worktree ended at
`typecheck: platform link missing` because `make deps` ran `npm install` after
`platform-dev` pruned the just-created `node_modules/ags-platform` symlink.
The rerun above passed; no repo file was changed to work around it. This is the
same ordering note recorded by REQ-004 and REQ-006.

## Release and merge

- Planning commit: `0ba370c` — `docs(REQ-007): start generations v3 ticket`.
- Implementation commit: `5408495` — `feat(REQ-007): consume generations v3`.
- This closeout commit records the evidence and is fast-forwarded into `main`
  (no merge commit), then annotated as `v0.6.0` and pushed with `main`.
- No existing tag is moved; `v0.1.0` … `v0.5.0` remain untouched.

## Deviations

- `templates/ags-app/` stays the frozen v1 copyable template, as recorded by
  REQ-004 and `README.md` (“Keep the template frozen per release”). Its
  `tests/unit.test.mjs` is not executed by this repo's gates and still shows
  the historical `palette-refresh`/`{"ok":true}` shape; migrating or
  regenerating the template is a separate app-scaffold change.
- No runtime screenshot/e2e was captured. The ticket changes the request
  command/ack wiring and pins only; the executed v3 handler test proves the
  generation-bound response, the bundle gate proves the imports resolve, the
  typecheck gate proves the callback types, and the source gates pin the
  unchanged fallback/layout behavior.
