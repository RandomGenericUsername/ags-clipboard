---
id: REQ-003
title: "Consume the app-scoped skin plane"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-003/
branch: ticket/REQ-003-skin-consumption
---

# Consume the app-scoped skin plane

## Requirement

Adopt the platform skin plane (frozen Skin Spec v1) in the clipboard app
without redesigning the overlay. `ags-platform` v0.8.0 exports
`createAppSkin({ configDir })`; the runtime emits the app-scoped
`$XDG_CONFIG_HOME/ags-clipboard/skin.css` plus the shared grouped token map
`$XDG_STATE_HOME/dotfiles/current/skin.json` (contracts v0.6.0).

`app.tsx` declares one module-level `skin` scoped to `ags-clipboard` and calls
`skin.apply()` immediately after `theme.apply()` in `main()`. The existing
`palette-refresh` handler keeps re-applying only the stable Theme pointer and
rebuilding the overlay; no skin-refresh request is added. The skin adapter owns
its own monitor and reloads `skin.css` when the runtime repoints it.

`style.css` stays the bundled glass fallback: no look declaration is removed,
and structure, class vocabulary, gestures, sizes and behavior do not change.
This app has no TSX layout tokens in v1, so no `createAppSkinValue` call is
added.

The local platform pin moves to v0.8.0 (`contracts` v0.6.0) and gates run with
the local overrides `AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform`
and `CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts`.

## Acceptance

- [x] `app.tsx` imports `createAppSkin`, declares one module-level
      `createAppSkin({ configDir: "ags-clipboard" })`, and calls `skin.apply()`
      immediately after `theme.apply()` in `main()`.
- [x] The `palette-refresh` handler is unchanged (theme pointer + overlay
      rebuild only) and there is still exactly one `requestHandler`; no skin
      request command is added.
- [x] `style.css` remains present with the bundled glass look declarations;
      selectors, geometry, class vocabulary and behavior are unchanged.
- [x] The Makefile pins `ags-platform` v0.8.0 / `contracts` v0.6.0.
- [x] A source-level validation test asserts the theme-then-skin startup order,
      the `ags-clipboard` config dir, the single request handler, and the
      retained `style.css` fallback.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.

## Implementation

- `app.tsx`: `import { createAppSkin } from "ags-platform/adapters/skin"`;
  module-level `const skin = createAppSkin({ configDir: "ags-clipboard" })`;
  `skin.apply()` immediately after `theme.apply()` in `main()`. The existing
  `paletteRefresh` closure and the single `requestHandler` are byte-identical.
- `tests/validation/skin-consumption.test.mjs` (new): static assertions for the
  one app-scoped factory call, the theme-then-skin order, the single request
  handler / no skin reachability, the absent layout-token accessor, and the
  retained `style.css` fallback.
- `Makefile`: platform pin v0.8.0 / contracts v0.6.0; the new validation suite
  joins `make test`.
- `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`, `CHANGELOG.md`, and the
  tuple assertion in `tests/app-contract.test.mjs`: describe/pin the same
  v0.8.0 / v0.6.0 tuple and the app-scoped skin artifact path.

## Evidence

### Source checks

- `app.tsx:6` imports `createAppSkin`; `app.tsx:21` declares the one
  `createAppSkin({ configDir: "ags-clipboard" })`; `app.tsx` applies
  `theme.apply()` then `skin.apply()` in `main()` (verified by
  `tests/validation/skin-consumption.test.mjs`).
- `app.tsx` has exactly one `requestHandler(`; the handler body contains no
  `skin`, no `skin-refresh`/`SKIN_REFRESH`, and no `wallpaper.state`. The
  `paletteRefresh` closure still calls only `theme.apply()` +
  `refreshClipboardAppearance()`.
- `style.css` is unchanged; the test re-asserts the panel `alpha(@surface,
  0.92)` + `16px` radius and the card `alpha(@surface, 0.45)` fallbacks.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0 after the deps link was present. Full log:
`/tmp/opencode/ags-clipboard-req003-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 16/16 pass (15 existing + `tests/validation/skin-consumption.test.mjs`) |
| `make conformance` | 13/13 pass, including the platform `checkAppRepo` template gate and the v0.8.0 / v0.6.0 pin assertion |
| `make drift` | all checks passed against contracts v0.6.0 |
| `make bundle` | `build/ags-clipboard.js`, 927,820 bytes |
| `make typecheck` | 0 errors in the ags-clipboard tree (27 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Local platform checkout: `/home/inumaki/Development/dotfiles/ags-platform`
(`git describe --tags --exact-match` → `v0.8.0`); contracts
`/home/inumaki/Development/dotfiles/contracts` → `v0.6.0`.

Environment note: the first invocation in the fresh worktree ended at
`typecheck: platform link missing` because `make deps` ran `npm install` after
`platform-dev` and pruned the just-created `node_modules/ags-platform` symlink.
After `@girs/` and TypeScript existed, the rerun above linked the platform and
passed. No repo file was changed to work around it.

## Release and merge

- Planning commit: `56e4616` — `docs(REQ-003): start app-scoped skin adoption ticket`.
- Implementation commit: `f82318d` — `feat(REQ-003): consume the app-scoped skin plane`.
- This closeout commit records the evidence and is fast-forwarded into `main`
  (no merge commit), then annotated as `v0.3.0` after the gates above.
- No existing tag is moved; `v0.1.0` and `v0.2.0` remain untouched.

## Deviations

- `templates/ags-app/` keeps its frozen v0.4.0 / v0.3.0 pins: the template's
  app does not consume the skin plane, and this ticket scopes the pin bump to
  the app-local Makefile/CI/docs as requested.
- No runtime screenshot/e2e was captured: this ticket changes only startup
  ordering/imports, the bundle gate proves the skin import resolves, and the
  source-level test pins the order. The runtime adapter's monitor is platform
  behavior, not re-proven here.

## Follow-ups (not this ticket)

- `ui/ItemCard.tsx` still derives the on-dark/on-light header ink from role
  luminance. Re-evaluate that contrast math once a skin can override per-type
  hues; do not half-refactor it here.
