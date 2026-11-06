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

- [x] `ui/ItemCard.tsx` no longer reads `colors.css` or references
      `GLib`, `relativeLuminance`, `paletteTokens`, `tokenCache`,
      `headerTextClass`, `on-dark` or `on-light`.
- [x] `style.css` has one per-kind `.kind-* .clipboard-head` rule that sets both
      the header background role and its matching `on_*` ink; no global
      `on-dark`/`on-light` classes remain.
- [x] `clearVisualCaches` clears only the icon texture cache.
- [x] The source gates assert the absence of the runtime palette read/luminance
      math and the per-kind ink mapping.
- [x] The six header pairs keep their dark-palette polarity and stay at or above
      7:1 contrast.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.

## Implementation

- `ui/ItemCard.tsx`: drop the `GLib` import, `TYPE_TOKEN`, `tokenCache`,
  `paletteTokens()`, `relativeLuminance()` and `headerTextClass()`. The header
  is created with only `clipboard-head`; the card's existing `kind-*` class is
  the selector hook. `clearVisualCaches` keeps only `textureCache.clear()`.
- `style.css`: each `.kind-* .clipboard-head` rule now sets its fill and the
  matching Material `on_*` ink. The `on-dark`/`on-light` rules are deleted.
- `tests/theme-roles.test.mjs`: pins the six fill/ink pairs, their distinct
  fills, and the absence of `colors.css`, `relativeLuminance`, `paletteTokens`,
  `tokenCache`, `headerTextClass` and the old ink classes.
- `tests/app-contract.test.mjs`: the refresh gate now requires only the
  rasterized-icon texture clear.
- `app.tsx`, `lib/appearance.ts`, `ui/ClipboardWindow.tsx`, `README.md` and
  `CHANGELOG.md`: describe the texture-only cache and the static ink map.

## Evidence

### Source checks

- `ui/ItemCard.tsx:1-5` has no `GLib` import; `ui/ItemCard.tsx:73-75`
  documents the CSS-owned ink; `ui/ItemCard.tsx:92-94` clears only
  `textureCache`; `ui/ItemCard.tsx:133` creates the header with no ink class.
- `style.css:121-159` is the static map; for example
  `.kind-text .clipboard-head { background-color: @tertiary; color:
  @on_tertiary; }` and `.kind-image .clipboard-head { background-color:
  @error_container; color: @on_error_container; }`. No `on-dark`/`on-light`
  selector or token remains.
- `tests/theme-roles.test.mjs:57-65` declares `HEADER_INK`; `:95-110` compares
  it with the parsed CSS rules; `:118-145` rejects the runtime palette read,
  luminance math, old ink classes and token cache.
- `tests/app-contract.test.mjs:290-294` requires
  `textureCache.clear()` and rejects `tokenCache`.
- Every new `@role` is in `PALETTE_V1_ROLES`; the role-vocabulary gate passes.

### Dark-palette parity

Roles read from the live dark generation
(`/home/inumaki/.local/state/dotfiles/current/colors.yaml`, linked as
`colors.gtk.css`). Ratios are WCAG relative luminance; the "old" column is the
outcome the removed runtime picker would choose for the same fill.

| Kind | Fill | New ink | Old class/ink | Old ratio | New ratio |
| --- | --- | --- | --- | --- | --- |
| `text` | `#e5bad8` `@tertiary` | `#44263e` `@on_tertiary` | `on-light`/`@on_primary` | 7.73:1 | 7.75:1 |
| `code` | `#0d0e13` `@surface_container_lowest` | `#e3e1e9` `@on_surface` | `on-dark`/`@on_surface` | 14.88:1 | 14.88:1 |
| `color` | `#ffb4ab` `@error` | `#690005` `@on_error` | `on-light`/`@on_primary` | 7.74:1 | 7.72:1 |
| `image` | `#93000a` `@error_container` | `#ffdad6` `@on_error_container` | `on-dark`/`@on_surface` | 7.22:1 | 7.24:1 |
| `link` | `#b9c3ff` `@primary` | `#212c61` `@on_primary` | `on-light`/`@on_primary` | 7.71:1 | 7.71:1 |
| `emoji` | `#c3c5dd` `@secondary` | `#2c2f42` `@on_secondary` | `on-light`/`@on_primary` | 7.73:1 | 7.76:1 |

Every kind keeps its previous light/dark polarity; the new pair is the
Material-correct ink for the fill. `code` is the neutral head and has no
`on_surface_container_lowest` role, so `@on_surface` is its deterministic ink.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-clipboard-req006-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 11/11 pass (unit + updated theme roles + appearance migration) |
| `make conformance` | 13/13 pass, including the platform `checkAppRepo` template gate and the v0.9.0 / v0.7.0 pin |
| `make drift` | all checks passed against contracts v0.7.0 |
| `make bundle` | `build/ags-clipboard.js`, 903,740 bytes |
| `make typecheck` | 0 errors in the ags-clipboard tree (27 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Environment note: the first `make gates` run in the fresh worktree stopped at
`typecheck: platform link missing` because `make deps` ran `npm install` after
`platform-dev` and pruned the just-created `node_modules/ags-platform` symlink.
The rerun above passed; no repo file was changed to work around it.

## Release and merge

- Planning commit: `f7a906e` — `docs(REQ-006): start static role-based ink mapping ticket`.
- Implementation commit: `f83c9a8` — `feat(REQ-006): use static role-based card header ink`.
- This closeout commit is fast-forwarded into `main` (no merge commit), then
  annotated as `v0.5.0` and pushed with `main`.
- No existing tag is moved; `v0.1.0` … `v0.4.0` remain untouched.

## Deviations

- The header icon is a `Gtk.Picture` for rendered SVG glyphs and cannot be
  recolored by CSS; the stock symbolic fallback (`Gtk.Image`) inherits the
  header ink. This is unchanged by the ticket: the ink mechanism only replaces
  how the header color is chosen.
- No runtime screenshot was captured. The change removes runtime palette I/O
  and keeps every kind's previous polarity; the source gate pins the mapping
  and `make gates` proves the bundle/typecheck path.
