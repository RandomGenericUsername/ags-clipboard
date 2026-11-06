---
id: REQ-006
title: "Use static role-based card header ink"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-006/
branch: ticket/REQ-006-ink-over-cleanup
---

# Use static role-based card header ink

## Requirement

The v2 appearance plane owns the palette and ink roles. `ui/ItemCard.tsx` must
stop reading `~/.config/ags/colors.css` at runtime, computing relative
luminance and choosing `on-dark`/`on-light` classes for the type header.

Replace that workaround with a static, role-based mapping in `style.css`: each
card kind's header text/icon uses the Material `on_*` role that belongs to its
header background. The TSX keeps only the per-kind card class; the header
carries no ink class.

| Kind | Header background | New ink | Old runtime outcome (dark palette) | Polarity |
| --- | --- | --- | --- | --- |
| `text` | `@tertiary` | `@on_tertiary` | `on-light` → `@on_primary` | dark ink preserved |
| `code` | `@surface_container_lowest` | `@on_surface` | `on-dark` → `@on_surface` | light ink preserved |
| `color` | `@error` | `@on_error` | `on-light` → `@on_primary` | dark ink preserved |
| `image` | `@error_container` | `@on_error_container` | `on-dark` → `@on_surface` | light ink preserved |
| `link` | `@primary` | `@on_primary` | `on-light` → `@on_primary` | unchanged |
| `emoji` | `@secondary` | `@on_secondary` | `on-light` → `@on_primary` | dark ink preserved |

`code` is the neutral/surface head (`surface_container_lowest` has no Material
`on_*` counterpart), so its deterministic role-based ink is `@on_surface`.

`clearVisualCaches` keeps only the texture-cache clear; the token cache is
removed. Selectors, geometry, alpha values, gestures and behaviour do not
change; only the ink mechanism moves from TS to CSS.

## Acceptance

- [ ] `ui/ItemCard.tsx` no longer reads `colors.css` or references
      `GLib`, `relativeLuminance`, `paletteTokens`, `tokenCache`,
      `headerTextClass`, `on-dark` or `on-light`.
- [ ] `style.css` has one per-kind `.kind-* .clipboard-head` rule that sets both
      the header background role and its matching `on_*` ink; no global
      `on-dark`/`on-light` classes remain.
- [ ] `clearVisualCaches` clears only the icon texture cache.
- [ ] The source gates assert the absence of the runtime palette read/luminance
      math and the per-kind ink mapping.
- [ ] The six header pairs keep their dark-palette polarity and stay at or above
      7:1 contrast.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.
