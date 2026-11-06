---
id: REQ-003
title: "Consume the app-scoped skin plane"
kind: requirement
status: in-progress
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

- [ ] `app.tsx` imports `createAppSkin`, declares one module-level
      `createAppSkin({ configDir: "ags-clipboard" })`, and calls `skin.apply()`
      immediately after `theme.apply()` in `main()`.
- [ ] The `palette-refresh` handler is unchanged (theme pointer + overlay
      rebuild only) and there is still exactly one `requestHandler`; no skin
      request command is added.
- [ ] `style.css` remains present with the bundled glass look declarations;
      selectors, geometry, class vocabulary and behavior are unchanged.
- [ ] The Makefile pins `ags-platform` v0.8.0 / `contracts` v0.6.0.
- [ ] A source-level validation test asserts the theme-then-skin startup order,
      the `ags-clipboard` config dir, the single request handler, and the
      retained `style.css` fallback.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.

## Follow-ups (not this ticket)

- `ui/ItemCard.tsx` still derives the on-dark/on-light header ink from role
  luminance. Re-evaluate that contrast math once a skin can override per-type
  hues; do not half-refactor it here.
