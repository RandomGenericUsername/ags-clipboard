# Changelog

## Unreleased

- Migrate `style.css` and the frozen `templates/ags-app/style.css` from legacy
  CSG positional carrier names to the semantic `palette.v1` roles the
  `ags-platform` v0.4.0 Theme provider projects (`@surface`, `@on_surface`,
  `@primary`, `@error_container`, `@tertiary`, …). Geometry, spacing, alpha
  values, selectors and behavior are unchanged; the destructive Clear button
  now uses the matching `@error_container` / `@on_error_container` fill+ink
  pair.
- The six per-type card headers keep their per-type hue: `text` `@tertiary`,
  `code` `@surface_container_lowest`, `color` `@error`, `image`
  `@error_container`, `link` `@primary`, `emoji` `@secondary`. The runtime
  contrast picker in `ui/ItemCard.tsx` now reads those role names, so the
  on-dark/on-light decision still matches the CSS fill.
- Add `tests/theme-roles.test.mjs`: it fails on any legacy positional carrier
  token and rejects any role the live `palette.v1` vocabulary does not declare.
- Pin the platform tuple at v0.4.0 (contracts stays v0.3.0) so local gates and
  CI exercise the provider that defines the roles. No refresh mechanism change:
  the legacy sheet is still applied verbatim and `theme.apply()` still runs
  once at startup.

## v0.1.0 — 2026-10-27

- Extract the clipboard-history overlay from `ags-apps` v0.5.0 into the
  standalone `ags-clipboard` repo (repo root is the app package).
- Full identity rename: app/instance `clipboard`, config dir `ags-clipboard`,
  window `clipboard-window`, launcher `clipboard-ui`, keybind description
  “Open clipboard history”.
- Read history/images from the runtime `clipboard` namespace.
- Implement the real `palette-refresh`: clear token/texture caches, re-apply
  the Theme pointer, rebuild the search icon and cards, preserve overlay
  visibility/query/selection/clipboard state; idempotent by appearance hash.
- Add the standalone dev flow (`AGENTS.md`, tickets, worktree guard, Makefile,
  CI, tests, `templates/ags-app/`) and the manifest/handler conformance gate.
- Pin the local-only v0.3.0 `ags-platform`/`contracts` tuple via `.dev/`.
