---
id: REQ-007
title: "Consume Generations v3 (contracts v0.8.0 / ags-platform v1.0.0)"
kind: requirement
status: in-progress
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

- [ ] `app.tsx` imports `APPEARANCE_REFRESH_COMMAND` from
      `ags-platform/ports/appearance-refresh`, dispatches it in the one
      `requestHandler`, and retains `createAppearance`, `appearance.apply()`
      and `createAppearanceRefreshHandler(appearance, work)`.
- [ ] The `work` callback returns `{ status: "applied" }` after
      `refreshClipboardAppearance()`; there is no `PALETTE_REFRESH_COMMAND`,
      `ports/palette-refresh` import or `{"ok":true}` ack in the app source.
- [ ] Source tests assert the v3 `appearance-refresh <genHash>` request and the
      generation-bound `{"applied":"<genHash>"}` response; no executed app test
      asserts the retired `palette-refresh`/`{ ok: true }` shape.
- [ ] `Makefile`, `.github/workflows/ci.yml` and the README/AGENTS/CHANGELOG
      pins state `ags-platform` `v1.0.0` / `contracts` `v0.8.0`.
- [ ] `style.css` remains the bundled glass fallback; the layout token and all
      overlay behavior are unchanged.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch merges fast-forward to `main`, the next minor tag is created,
      and `main` plus the tag are pushed.

## Implementation

Pending.

## Evidence

Pending.

## Release and merge

Pending.

## Deviations

Pending.
