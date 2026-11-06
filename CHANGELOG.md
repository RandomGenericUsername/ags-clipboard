# Changelog

## v0.5.0 — 2026-11-06

- Move the card header ink into `style.css` as a static per-kind map:
  `text` `@tertiary`/`@on_tertiary`, `code`
  `@surface_container_lowest`/`@on_surface`, `color` `@error`/`@on_error`,
  `image` `@error_container`/`@on_error_container`, `link`
  `@primary`/`@on_primary`, `emoji` `@secondary`/`@on_secondary`. The dark
  palette keeps each header's previous light/dark polarity at 7.24–14.88:1.
- Remove the runtime workaround from `ui/ItemCard.tsx`: no
  `~/.config/ags/colors.css` read, no relative-luminance threshold, no
  `on-dark`/`on-light` classes and no palette token cache.
  `clearVisualCaches` now clears only the rasterized-icon texture cache.
- `tests/theme-roles.test.mjs` pins the six per-kind fill/ink pairs and the
  absence of the palette read/luminance math; `tests/app-contract.test.mjs`
  requires only the texture-cache clear.

## v0.4.0 — 2026-11-06

- Migrate to the unified appearance plane (contracts v0.7.0 / `ags-platform`
  v0.9.0): `app.tsx` declares one
  `createAppearance({ configDir: "ags-clipboard" })` and `main()` calls
  `appearance.apply()`. The split `theme.apply()` / `skin.apply()` startup is
  removed.
- The one `palette-refresh` command now goes through
  `createAppearanceRefreshHandler(appearance, work)`: the platform re-applies
  the whole appearance and owns hash idempotence, while `work` keeps the
  non-destructive cache clear, search-icon rebuild and card rebuild. No new
  request command is added.
- The card width is the TSX-owned layout token
  `layout.ags-clipboard.card-width` (fallback `260`) instead of a hard constant.
  `style.css` remains the bundled glass fallback; selectors, geometry,
  gestures and behavior are unchanged.
- Replace `tests/validation/skin-consumption.test.mjs` with
  `tests/validation/appearance-migration.test.mjs`: appearance
  apply/configDir/refresh-handler wiring, the layout token, and the absence of
  Theme/Skin calls.
- Pin the local tuple at `ags-platform` v0.9.0 / `contracts` v0.7.0.

## v0.3.0 — 2026-11-05

- Consume the app-scoped skin plane: `app.tsx` declares one
  `createAppSkin({ configDir: "ags-clipboard" })` and `main()` calls
  `skin.apply()` immediately after `theme.apply()`. The composed skin provider
  is installed last at USER priority over the bundled `style.css` glass
  fallback; missing skin artifacts are a no-op.
- The existing `palette-refresh` handler and the single `requestHandler` are
  unchanged. No skin-refresh request is added; the platform adapter's own
  monitor reloads `$XDG_CONFIG_HOME/ags-clipboard/skin.css` when the runtime
  repoints it. No TSX layout tokens are added (none exist in v1).
- Add `tests/validation/skin-consumption.test.mjs`: startup order, the
  `ags-clipboard` config dir, the single request handler, and the retained
  glass fallback.
- Pin the local tuple at `ags-platform` v0.8.0 / `contracts` v0.6.0.

## v0.2.0 — 2026-11-01

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
