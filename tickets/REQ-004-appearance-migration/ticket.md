---
id: REQ-004
title: "Migrate the clipboard app to the v2 appearance plane"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-004/
branch: ticket/REQ-004-appearance-migration
---

# Migrate the clipboard app to the v2 appearance plane

## Requirement

Adopt the unified Appearance plane (contracts `v0.7.0`, `ags-platform`
`v0.9.0`) in the clipboard app. The runtime (`v0.9.1`) publishes palette, skin
and mode as one immutable generation behind the single repointed hop
`$XDG_STATE_HOME/dotfiles/current/appearance`; consumers watch that hop and
read `$XDG_CONFIG_HOME/<configDir>/appearance.css` plus its `tokens.json`.

`app.tsx` declares one module-level
`createAppearance({ configDir: "ags-clipboard" })` and `main()` calls
`appearance.apply()`. The split `theme.apply()` / `skin.apply()` startup is
removed, as are the v1 Theme/Skin imports.

The `palette-refresh` handler becomes
`createAppearanceRefreshHandler(appearance, work)`. The platform helper always
re-applies the whole appearance before the app-owned `work`; `work` keeps the
existing non-destructive clipboard behavior (clear the visual caches, rebuild
the static search icon, rebuild the cards) and does not call `theme.apply()`.
The single `requestHandler` and the fixed `PALETTE_REFRESH_COMMAND` dispatch
stay unchanged; no new request command is added. Idempotence by appearance
hash and any deferred/failed outcome remain platform-owned.

The card width becomes the TSX-owned layout token
`appearance.value("layout.ags-clipboard.card-width", 260)` (read with `peek()`
where a plain number is required) instead of the hard-coded `260`. The
`style.css` glass fallback, selectors, class vocabulary, gestures, geometry and
behavior do not change. `ui/ItemCard.tsx` keeps its role-luminance contrast
math; replacing it with v2 ink tokens is a recorded follow-up, not this ticket.

The local pins move to `ags-platform` `v0.9.0` / `contracts` `v0.7.0`; gates
run with the local overrides
`AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform` and
`CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts`.

## Acceptance

- [ ] `app.tsx` imports `createAppearance`, declares one module-level
      `createAppearance({ configDir: "ags-clipboard" })`, and calls
      `appearance.apply()` in `main()`; no `theme`/`skin` import or apply call
      survives.
- [ ] The palette-refresh wiring is
      `createAppearanceRefreshHandler(appearance, work)`, where `work` only
      rebuilds the clipboard surface (caches, search icon, cards). There is
      still exactly one `requestHandler`; no new request command is added.
- [ ] The card width comes from
      `appearance.value("layout.ags-clipboard.card-width", 260)` rather than a
      hard constant.
- [ ] `style.css` remains present with the bundled glass fallback; selectors,
      geometry, class vocabulary, gestures and behavior are unchanged.
- [ ] The local Makefile pins `ags-platform` `v0.9.0` / `contracts` `v0.7.0`.
- [ ] A source-level validation test asserts the appearance apply/configDir
      wiring, the appearance-refresh handler, and the absence of theme/skin
      calls, plus the retained `style.css` fallback.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.
- [ ] `ItemCard` contrast math is recorded as a follow-up (v2 ink tokens can
      replace it later).

## Follow-ups (not this ticket)

- `ui/ItemCard.tsx` still derives the on-dark/on-light header ink from palette
  role luminance. Re-evaluate that contrast math once the v2 `ink` tokens are
  consumed directly; do not half-refactor it here.
