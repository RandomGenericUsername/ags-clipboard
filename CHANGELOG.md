# Changelog

## v0.7.3 — 2026-11-26

- Clamp code-card text by both logical lines and per-line width before GTK
  measures it. A pasted 100-line code item now stays at the standard 720×450
  stage size and navigation no longer lays out the full paste.

## v0.7.2 — 2026-11-26

- Give the root widget key focus when the overlay opens in both layouts, so
  the full-layout search entry no longer swallows arrow-key navigation. `/`
  still focuses search intentionally.

## v0.7.1 — 2026-11-26

- Image previews now use `Gtk.ContentFit.CONTAIN` with centered letterboxing
  instead of `COVER` cropping, so portrait and wide clipboard captures show the
  whole image in both full-stage and compact cards. Stage image cards use the
  full body height below the header.
- Full-stage text/code labels are clamped before GTK measures them: text is
  normalized, cut to a character budget derived from card width/height, and
  ends with one ellipsis. Fitting text is shown in full; oversized pastes stay
  at the standard 720×460 card size.
- Decoded image textures are cached (24 entries) so full-stage navigation does
  not re-decode current/peek images.
- Opening the overlay selects the newest copied item.

## v0.7.0 — 2026-11-22

### REQ-009 full-layout polish

- Enforce a fixed stage-card frame and width-capped link/text/code previews so
  long links cannot widen the stage; code/text stage cards wrap the full text
  with an 8/10-line cap instead of collapsing to one line.
- Center the 22×22 pin glyph with a `Gtk.CenterBox`.
- Make the pinned overlay fill the full stage with 4 full-width columns.
- Add a full-layout Clear control with inline confirm, full-layout search and
  type filters synced with compact state, and a `/` keycap + `/` focus in both
  search boxes.
- Compact Enter now copies the selected item and collapses the overlay like
  full mode; Ctrl+1..9 and double-click remain copy-only. Hints say
  `copy+close`.
- Changing Layout or compact alignment from the in-page settings panel now
  closes the panel after applying the change; card-size changes keep it open.
- Remove the settings config-path footer; persistence is unchanged.

### REQ-009 settings-open stability

- Keep the layer-shell surface full-monitor with zero margins for all modes;
  settings open/close and alignment changes no longer re-anchor/remap it.
- Position `.clipboard-compact` inside the transparent surface (bottom strip or
  full-height left/right column) with 12 px insets.
- Restrict the window input region to the compact shell when settings is
  closed (`cairo.Region` from `compactRoot.get_allocation()`); use the full
  window when settings is open so the in-page catcher/panel receive input.

### REQ-009 live preview fixes

- Fix compact Left/Right collapsing to the bottom: one `applyCompactShell()`
  now sets spacer visibility, `vexpand`, `valign`, `halign`, width, list
  orientation, scroll policies and arrow visibility for vertical vs bottom
  layouts. Alignment changes and settings open/close reapply the full shell.
- Replace per-widget content-accent providers with one display-wide provider at
  `USER + 1`, removing repeated style invalidation on every render.
- Make compact arrow selection incremental (`compactCards` key→widget map);
  no full `renderCompact()` on movement, and `copyOnly`/Esc/hide no longer
  rebuild. Live 100-move benchmark: 7 ms.
- Keep the compact bottom strip pinned at the bottom while the in-page settings
  panel is open full-monitor; vertical columns stay full height.

### REQ-009 117 batch alignment

- Move overlay settings from `Gtk.Popover`/`MenuButton` to one in-page
  `.clipboard-settings` panel over a full-window `.clipboard-settings-catcher`.
  Compact temporarily expands the same `surface.panel` window full-monitor while
  settings are open so the panel is never clipped; Esc/outside click close and
  changes save immediately.
- Remove the `appearance.value("layout.ags-clipboard.card-width", 260)` read.
  The card width is the app-owned `CARD_WIDTH = 260` constant.
- Keep clipboard type accents as app-owned content paint: per-widget
  `Gtk.CssProvider` at `USER + 1` for headers/dots/pin fills/selected/focused
  cards. Selected/focused states replace the skin base hairline with one ring.
- Document the skin boundary and the exact selectors the skin template must
  remove/replace; clipboard stays on `surface.panel` (no `surface.overlay`,
  contracts v0.14.0 / assets v0.23.0).

### REQ-009 card-stage clipboard

- Replace the REQ-005 rail + preview surface with the card-stage clipboard.
  Full mode (default) is a full-monitor stage over a dimmed scrim: one focused
  card (~720 × 460, clamped) with previous/next peeks, circular arrows, a
  bottom control bar and a 4-column pinned grid opened by `↑` or the pill and
  closed by `↓`/`Esc`/Back. Pinned-grid `←`/`→` wrap a focused pin without
  moving the stage deck; `Enter`/click copies and collapses. `Ctrl+1..9`,
  `Ctrl+F`, `Ctrl+Z`, `Delete` and honest empty/single-pin states are kept.
- Add Compact mode: bottom/left/right card strip, `Recent | Pinned (n)` view,
  Small/Medium/Large cards (220/260/300 px), search, type filter, incognito,
  inline clear confirmation, settings, `Tab`/`Shift+Tab` view switching
  (Bottom also `↑`/`↓`; vertical also `←`/`→` when search is not focused) and
  a visible per-link `Open` chip.
- Add the capture-tool settings pattern: pure `lib/settings.ts`,
  `lib/settings-store.ts` port and the GLib adapter at
  `$XDG_CONFIG_HOME/clipboard-ui/config.json`
  (`{ "layout": { "mode", "compact": { "card_size", "alignment" } } }`),
  save-on-change, unknown/missing/corrupt values degrading to
  `full`/`medium`/`bottom`. The file is app-owned, never an AGS link or the
  daemon config.
- Preserve the `clipboard-window`/`clipboard` request surface, the
  `appearance-refresh <genHash>` handler and `style.css` fallback. Live
  captures no longer steal the current selection; a `n new` badge offers to
  jump to them. Delete-with-undo restores the card and keeps its cached image
  through the undo window.
- `make test` now executes the settings domain/port and the deck, view,
  selection and pinned-focus logic; conformance pins the app-owned settings
  path and save-on-change setters.
- Owner feedback round 1: one-frame settings popover with the mock's anatomy;
  settings closes/reopens around window re-anchoring so alignment changes are
  never clipped; compact cards are exactly 220/260/300 px (the old 260 px CSS
  clamp is gone) and vertical columns track the selected width; nav/strip
  arrows stay 46×46/32×32 circles; every card header carries a working pin
  control that does not trigger select/copy; Incognito/Clear gained pause-play
  and trash icons; type filter chips gained semantic 6 px dots; the full bar
  gained icon+keycap controls and `Ctrl+Enter` opens the selected link; the
  pinned view is now a stage-preserving overlay with the mock inset, 4-column
  grid, focus rings and Back keycap.
- Owner feedback round 2: removed the GTK-unsupported `max-width`/`max-height`
  CSS (arrows keep their circular size through widget size requests) and added
  a stylesheet validity guard; neutralized the `Gtk.MenuButton` child button so
  the 38×38 gear has skin-transparent default paint and an accent-ring hover;
  made the 22×22 pin button square in every card header; replaced the six
  per-kind selection/focus rules with one shared `@primary` accent rule and
  removed all hard-coded chrome hex; documented the skin radius/selection
  selectors for the shared paint lane.
- Owner feedback round 3: the pin is a visible 22×22 skin-derived square with
  rest/hover/pinned fills; compact no longer autofocuses search and arrow
  navigation wraps and scrolls; search focus is drawn by the rounded box and
  the inner entry outline is neutralized; per-kind selection/focus rings are
  restored; the compact `N new` and `N recent/pinned` counters are removed;
  and the pinned view now fills four homogeneous columns with 236 px rows,
  16 px gaps and the mock header order.
- Owner feedback round 4: card headers are one neutral surface/ink plate
  instead of six per-kind fills; type identity moved to a 6 px
  `.clipboard-type-dot` (the only type-coloured header element); selection and
  pin focus use one shared `@primary` rule; the pin square uses the neutral
  control fill; the new selectors are listed for the skin lane, which must
  delete the old per-kind header/selection/focus/pin rules.
- Owner feedback round 5: restored per-type headers using the scheme's accent
  families — Text primary, Link primary_container, Code secondary_container,
  Image secondary, Color tertiary, Emoji tertiary_container — each with its
  matching `on_*` ink. Selection/focus/pin fills follow the same families;
  filter dots use the header fills and header dots use the header ink. Error
  and neutral-black roles are gone from type identity; full gates pass and the
  skin selector list is updated.

## v0.6.2 — 2026-11-12

- Refresh the local pin tuple to `ags-platform` `v1.1.0` / `contracts`
  `v0.12.0`. The Makefile, CI checkout and tuple-presence assertion,
  conformance/validation assertions and README/AGENTS state the
  `v1.1.0` / `v0.12.0` tuple.
- Pin parity only: `app.tsx`, `lib/`, `ui/`, `style.css`, the layout token and
  the `appearance-refresh <genHash>` handler/ack behavior are unchanged. No
  request command or appearance protocol is added.
- `ags-platform` `v1.1.0` / `contracts` `v0.12.0` add the required
  `surface.window` outer/toplevel role and remain API-compatible for this
  app's `value(...)` reads and generation apply/ack; the window group belongs
  to the runtime/assets/composition plane, so no app-side migration is needed.

## v0.6.1 — 2026-11-07

- Refresh the local platform pin to `ags-platform` `v1.0.1` while keeping
  `contracts` `v0.8.0`. The Makefile, CI checkout, conformance/validation
  assertions and README/AGENTS state the `v1.0.1` / `v0.8.0` tuple.
- Pin parity only: `app.tsx`, `lib/`, `ui/`, `style.css`, the layout token and
  the `appearance-refresh <genHash>` handler/ack behavior are unchanged. No
  request command or appearance protocol is added.

## v0.6.0 — 2026-11-07

- Consume Generations v3 (contracts `v0.8.0` / `ags-platform` `v1.0.0`). The
  platform adapter reads `$XDG_STATE_HOME/dotfiles/current/manifest.json` and
  `current/appearance/ags-clipboard.css` plus `tokens.json`; it no longer reads
  the v2 config-home convenience link or any skin path.
- Replace the retired `palette-refresh` transport with the one v3
  `appearance-refresh <genHash>` command. `app.tsx` keeps a single
  `createAppearance({ configDir: "ags-clipboard" })`, one `appearance.apply()`
  and one `createAppearanceRefreshHandler(appearance, work)`; the work returns
  `{ status: "applied" }` so the helper answers
  `{"applied":"<genHash>"}`. No new command is added.
- `tests/unit.test.mjs` executes the v3 handler's generation-bound ack and
  rejects `palette-refresh`; the source gates pin `APPEARANCE_REFRESH_COMMAND`
  and the applied work result, and reject the old `{"ok":true}` shape.
- `style.css` remains the bundled glass fallback; the
  `layout.ags-clipboard.card-width` token (fallback `260`), selectors, geometry,
  gestures and behavior are unchanged.
- Pin the local tuple at `ags-platform` v1.0.0 / `contracts` v0.8.0 in the
  Makefile, CI and docs.

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
