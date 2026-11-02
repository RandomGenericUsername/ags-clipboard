---
id: REQ-002
title: "Migrate the clipboard CSS to semantic palette.v1 roles"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-002/
branch: ticket/REQ-002-theme-roles
---

# Migrate the clipboard CSS to semantic palette.v1 roles

## Requirement

Replace every legacy CSG positional carrier reference in the clipboard
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

- [x] `style.css` and `templates/ags-app/style.css` contain zero legacy
      positional carrier tokens (including comments); no CSS/TS/TSX file
      references one.
- [x] Every replacement is a role in the live `palette.v1` vocabulary
      (`@surface`, `@on_surface`, `@primary`, `@error_container`, `@tertiary`,
      …); `tests/theme-roles.test.mjs` pins that.
- [x] The `TYPE_TOKEN` map in `ui/ItemCard.tsx` uses the same role names as the
      stylesheet, so the header's on-dark/on-light decision matches its fill.
- [x] Geometry, alpha values, selectors and the palette-refresh path are
      unchanged; `app.tsx` and `lib/` have no diff.
- [x] The platform pin is v0.4.0 in the Makefile, the template Makefile, CI and
      the template CI; `contracts` stays v0.3.0.
- [x] `make test`, `make conformance`, `make drift`, `make bundle` and
      `make typecheck` pass on the branch.
- [x] Before/after visual evidence was captured with `grim`.

## Role migration (intent, not carrier index)

The live tpr palette is
`/home/inumaki/.local/state/dotfiles/current/colors.gtk.css` (palette hash
`e44cd31c…`, pointer repointed 2026-11-01 22:48). Under it the legacy aliases
resolve to Material roles — for example the search field's carrier resolves to
`error` (salmon) and the Clear carrier resolves to `secondary` (light tan).
That is exactly why the mapping is per site.

### Structural sites

| Site | Old carrier | Role | Why |
|---|---|---|---|
| window ink, body text, code, hex, placeholder/hairline alphas | `color_foreground` | `@on_surface` | The sheet's ink role; every `alpha()` value is unchanged. |
| `.clipboard-panel` fill | `color_00` | `alpha(@surface, 0.92)` | Panel/dish background. |
| `.clipboard-panel` border, `.clipboard-card:hover`, link ink | `color_04` / `color_10` | `@primary` | Accent border/hover/link. |
| `.clipboard-search` solid fill | `color_01` | `@surface_container` | "Solid surface one step above the panel" (gui-unification §4); matches the wallpaper-selector's migrated field. |
| `.clipboard-incognito` active toggle | `color_06` | `@primary` | shared action-active role (gui-unification §4). |
| `.clipboard-clear` fill / ink | `color_03` / `color_foreground` | `@error_container` / `@on_error_container` | Destructive fill with light text; the matching container ink keeps the polarity and the contrast (7.24:1). |
| `.clipboard-card` fill / hairline | `color_background` / `color_foreground` | `alpha(@surface, 0.45)` / `alpha(@on_surface, 0.12)` | Translucent card fill and hairline, not text. |
| `.clipboard-index` wash | `color_00` | `alpha(@surface, 0.32)` | The same darkening wash behind the position badge. |
| `.clipboard-head.on-dark` ink | `color_15` | `@on_surface` | Light ink on a dark header. |
| `.clipboard-head.on-light` ink | `color_00` | `@on_primary` | Dark ink on a light header; `@on_primary` stays dark on every light type role (7.70–7.73:1). `@background` would invert in a light palette. |

### Per-type hues (header fill and selected ring/tint share the role)

| Kind | Old carrier | Role | Hue intent |
|---|---|---|---|
| `text` | `color_06` | `@tertiary` | the mockup's teal/green type hue |
| `code` | `color_00` | `@surface_container_lowest` | dark neutral |
| `color` | `color_13` | `@error` | the mockup's pink type hue |
| `image` | `color_09` | `@error_container` | the mockup's red type hue |
| `link` | `color_04` | `@primary` | the accent (the mockup's blue slot; this scheme's accent is warm) |
| `emoji` | `color_12` | `@secondary` | the mockup's gold type hue |

## Ambiguous mappings (called out, not guessed silently)

- **`color_06` serves two intents.** It is the action-active slot on the
  Incognito toggle *and* the text-card type hue. The toggle maps to
  `@primary`; the text header maps to `@tertiary`. Collapsing both to
  `@primary` would erase the documented per-type selection exception
  (gui-unification §3.7) and make text/link headers identical.
- **`color_03` (Clear).** The live alias is `secondary` (a light tan) but the
  comment and gesture are destructive with light text. Used
  `@error_container` + `@on_error_container`. The alternative `@error` +
  `@on_error` is a light fill with dark ink and would flip the polarity.
- **`color_01` (search field).** The live alias is `error` (salmon) — visible in
  the before shot — but the comment describes a neutral solid field. Used
  `@surface_container`, matching the migrated wallpaper-selector field.
- **`color_10` (link text).** The live alias is `tertiary_container` (olive);
  the intent is link/accent ink, so it maps to `@primary`.
- **The type hues are decorative, not state roles.** `error`/`error_container`
  are used for the color/image types because they carry the mockup's pink/red
  hues, not because those cards are errors. They remain distinguishable from
  the six-role set and are asserted distinct by the gate.
- **Index badge wash.** Kept as `alpha(@surface, 0.32)` to mirror the original
  darkening wash; `@scrim` would be the palette-relative overlay alternative.
- **Type-role polarity.** In the live palette `tertiary`, `error`, `primary` and
  `secondary` are light, so the text/color/link/emoji headers use the on-light
  ink (`@on_primary`, 7.70–7.73:1) while code/image stay on-dark. This follows
  the role luminance exactly as the old code followed the carrier luminance;
  the runtime picker computes the same class from the same role names.

## Implementation

- `style.css`: every legacy carrier replaced with a role from the tables above;
  comments rewritten to the role vocabulary. Selectors, geometry, alphas and
  the selection gesture are byte-for-byte unchanged.
- `templates/ags-app/style.css`: window ink → `@on_surface`.
- `ui/ItemCard.tsx`: `TYPE_TOKEN` now holds the six role names, with a comment
  pinning the CSS/TS contract; the luminance threshold and on-dark/on-light
  classes are unchanged.
- `tests/theme-roles.test.mjs` (new): repo-wide legacy-token scan, live
  `palette.v1` role validation, TYPE_TOKEN ↔ header-fill agreement, and the
  six-role distinctness check.
- `Makefile`, `.github/workflows/ci.yml`, `templates/ags-app/` Makefile/CI/
  README, `README.md`, `AGENTS.md`, `tests/app-contract.test.mjs`: platform pin
  v0.4.0 (contracts stays v0.3.0). `CHANGELOG.md`: Unreleased entry.

## Evidence

### Source checks

- Legacy-token scan (worktree root, assembled pattern so this ticket stays clean
  under the same scan):
  `rg -n "@col""or_" . --glob '!node_modules' --glob '!@girs' --glob '!.git'`
  → **exit 1, no matches**. The same command over `--glob '*.css' --glob
  '*.ts' --glob '*.tsx'` is also empty.
- `style.css` role set: `error, error_container, on_error_container,
  on_primary, on_surface, primary, secondary, surface, surface_container,
  surface_container_lowest, tertiary`.
- `parsePaletteYaml` over the live `colors.yaml` (v1, 56 roles) +
  `missingPaletteRoles` for that set → `[]` (log:
  `/tmp/opencode/ags-clipboard-req002-contrast.log`).
- `app.tsx` and `lib/` have no diff; `theme.apply()` still runs once at startup
  and the refresh handler is untouched.

### Contrast (live palette, WCAG relative luminance)

| Pair | Site | Ratio |
|---|---|---|
| `on_surface` on `surface` | panel/card ink | 14.35:1 |
| `on_surface` on `surface_container` | search field | 12.69:1 |
| `on_primary` on `tertiary` | text header (on-light) | 7.70:1 |
| `on_surface` on `surface_container_lowest` | code header (on-dark) | 14.94:1 |
| `on_primary` on `error` | color header (on-light) | 7.73:1 |
| `on_surface` on `error_container` | image header (on-dark) | 7.24:1 |
| `on_primary` on `primary` | link header (on-light) | 7.70:1 |
| `on_primary` on `secondary` | emoji header (on-light) | 7.73:1 |
| `on_error_container` on `error_container` | Clear button | 7.24:1 |
| `primary` on `surface` | link text | 10.88:1 |
| `primary` on `surface_container` | accent border/hover | 9.62:1 |

No text pair falls below 7:1. The alpha ring/tint values are decorative and
unchanged.

### Gates

Command (worktree root):
`AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts make gates`
→ exit 0; log `/tmp/opencode/ags-clipboard-req002-gates.log`.

- `make test`: 15/15 pass (11 unit + 4 new theme-role tests).
- `make conformance`: 13/13 pass, including the platform `checkAppRepo`
  template gate and the v0.4.0 platform / v0.3.0 contracts pin.
- `make drift`: all checks passed against contracts v0.3.0.
- `make bundle`: `build/ags-clipboard.js`, 808,612 bytes.
- `make typecheck`: 0 errors in the ags-clipboard tree (27 tolerated
  `/usr/share/ags/js` errors, 0 platform errors).
- Local platform link: `node_modules/ags-platform` →
  `/home/inumaki/Development/dotfiles/ags-platform` (checkout at tag v0.4.0,
  `git describe --tags --exact-match` → `v0.4.0`).

### Visual evidence (`grim`, 1920×1080)

Directory: `/tmp/opencode/ags-clipboard-visual-shots/`.

| Shot | Shows |
|---|---|
| `before-full.png` | the deployed v0.1.0 overlay with the real history: legacy search fill resolves to `error` (salmon) and Clear to `secondary` (light tan); text headers use the legacy blue-grey carrier |
| `after-full.png` | the worktree app + new CSS: neutral `@surface_container` search field, `@error_container` Clear with light ink, `@tertiary` text headers |
| `before-types-full.png` | the same synthetic six-kind history through the legacy CSS |
| `after-types-full.png` | text (olive/`tertiary`), code (near-black/`surface_container_lowest`), color (pink/`error`), image (dark red/`error_container`), link (accent/`primary`), emoji (tan/`secondary`) headers; the selected text card shows the `@tertiary` ring + 12% tint |

The after instance ran from a temporary copy of `app.tsx` with
`instanceName: "clipboard-visual"` (the committed `app.tsx` is unchanged),
under `XDG_CONFIG_HOME=/tmp/opencode/ags-clipboard-visual-config` with
`ags/colors.css` symlinked to the live pointer and
`XDG_STATE_HOME=/tmp/opencode/ags-clipboard-visual-state` for the synthetic
history/palette. The user's installed `clipboard` instance was shown, shot and
hidden again; its process was never replaced. No wallpaper was changed.

### What the user should eyeball after deploying

1. The search field is a neutral raised surface (not salmon).
2. Clear is a dark red `@error_container` button with light ink.
3. Text headers are the palette's green/teal `@tertiary`; code/color/image/
   link/emoji headers stay distinct.
4. The selected card ring + tint follows its type role (text = green).
5. Incognito-on is a `@primary` tint/border; the panel border stays accent.
6. A deployed sheet with any legacy carrier would mean a stale install — the
   repo and `tests/theme-roles.test.mjs` are clean.

## Outcome

Branch `ticket/REQ-002-theme-roles`: ticket start `d58728e`, implementation
`52b40a6`, and this evidence/close-out in the follow-up docs commit. No tag,
push or merge; the platform pin is v0.4.0 and contracts stays v0.3.0.
