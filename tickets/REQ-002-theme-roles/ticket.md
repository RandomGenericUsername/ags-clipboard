---
id: REQ-002
title: "Migrate the clipboard CSS to semantic palette.v1 roles"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-002/
branch: ticket/REQ-002-theme-roles
---

# Migrate the clipboard CSS to semantic palette.v1 roles

## Requirement

Replace every legacy CSG `@color_*` carrier reference in the clipboard
stylesheet (and the frozen `templates/ags-app/style.css` fixture) with the
semantic `palette.v1` role names that `ags-platform` v0.4.0 projects into the
composed GTK provider. The runtime's `palette-refresh` path is unchanged: the
same Theme pointer is re-applied, the same caches are dropped, and the same
search icon/cards rebuild.

The migration maps by **intent per site**, not by carrier index. Geometry,
spacing, radii, alpha values, selectors, CSS class names and behaviour do not
change. Only the color token changes — and, where a solid fill changes polarity,
the matching `on_*` ink.

The six per-type card hues stay personalisable ("type may personalise the hue,
never the gesture"): each item kind keeps its own role, and the selected-card
ring + 12% tint continues to follow that type role. The runtime contrast picker
in `ui/ItemCard.tsx` reads the same role names so the header text polarity
matches the CSS.

## Acceptance

- [ ] `style.css` and `templates/ags-app/style.css` contain zero `@color_*`
      tokens (including comments); no CSS/TS/TSX file references a legacy
      carrier.
- [ ] Every replacement is a role in the live `palette.v1` vocabulary
      (`@surface`, `@on_surface`, `@primary`, `@error_container`, `@tertiary`,
      …); a new static gate pins that.
- [ ] The `TYPE_TOKEN` map in `ui/ItemCard.tsx` uses the same role names as the
      stylesheet, so the header's on-dark/on-light decision still matches its
      fill.
- [ ] Geometry, alpha values, selectors and the palette-refresh path are
      unchanged; `app.tsx`, `lib/` and the provider consumer stay as they are.
- [ ] The platform pin is v0.4.0 in the Makefile, the template Makefile, CI and
      the template CI; `contracts` stays v0.3.0.
- [ ] `make test`, `make conformance`, `make drift`, `make bundle` and
      `make typecheck` pass on the branch.
- [ ] Before/after visual evidence is captured with `grim` where Hyprland IPC
      allows it; otherwise the exact eyeball checklist is recorded.
