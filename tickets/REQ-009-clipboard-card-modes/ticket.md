---
id: REQ-009
title: "Card-stage clipboard: full card deck + compact card strip"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-009/
branch: ticket/REQ-009-clipboard-card-modes
---

# Card-stage clipboard: full card deck + compact card strip

## Requirement

Supersede the REQ-005 rail + preview surface with a card-centric clipboard. The
design keeps the thing the user already recognises — the per-type coloured card
header with glyph, type label and relative time — and gives it two layouts:

- **Full** (default): a full-monitor card stage over a dimmed/blurred desktop.
  One large focused card (about 720 × 460, clamped) is centred; the previous and
  next cards peek left and right as narrow, scaled, dimmed cards. The stage
  browses the complete deck (pinned cards first), not a filtered list.
- **Compact**: the bottom-anchored, full-width card strip with the current cards,
  plus configurable alignment (`Bottom`, `Left`, `Right` vertical edge), a
  `Recent | Pinned` carousel view, card size (`Small/Medium/Large`), search,
  type filter, incognito, clear, settings, keyboard view switching and a visible
  link `Open` action. The desktop stays visible and sharp.
- Both modes preserve every current capability: all six kinds, copy-back,
  pin/unpin, delete with undo, clear with confirm, incognito, live updates
  without stealing selection, link open, honest empty states and `Ctrl+1..9`.

REQ-005's rail + preview is frozen on `main` and is **not** modified by this
ticket. REQ-009 replaces its interaction model; REQ-005 remains the historical
record. The live app keeps the current card strip until REQ-009 is implemented.

## Audit against 117 (2026-11-21)

Binding brief: `dotfiles-v3/docs/117-redesign-batch.md` + `dotfiles-assets/skins/README.md`
(“Overlay app implementation pattern”, “Skin boundary”). Clipboard is an AGS
layer-shell overlay, so its outer role is **`surface.panel`**, never
`surface.window` and never the `surface.overlay` experiment (contracts v0.14.0
/ assets v0.23.0 are not consumed; the release line is assets v0.22.3).

Conflicts found in the current implementation and the decisions taken:

| # | Conflict | Decision |
| --- | --- | --- |
| 1 | Settings are `Gtk.MenuButton`/`Gtk.Popover` inside a layer-shell overlay. | Replace with one in-page `.clipboard-settings` panel plus a full-window `.clipboard-settings-catcher`. Gears become plain `Gtk.Button`s. Esc and outside click close; changes still save immediately. |
| 2 | Compact mode is a strip-height layer-shell window, so an in-page panel would be clipped above it. | While settings are open, temporarily anchor the same window full-monitor (`surface.panel`), keep the compact strip pinned at the bottom with an expanding spacer, and place the settings panel top-right inside the monitor. Closing settings restores the compact anchor/margins. The catcher makes it modal for that interval. |
| 3 | The skin template owns per-kind clipboard colours (headers, dots, selected/focused rings, pin fills) and even `min-width: 260px`. Those are content accents/layout. | Keep type accents app-side as content paint. Use per-widget `Gtk.CssProvider` paint at `USER + 1` for headers/dots/pins/selected/focused cards so content wins over skin role rules. The skin template must remove the per-kind roles and `min-width`; it keeps only role surfaces/base states. |
| 4 | `app.tsx` reads `appearance.value("layout.ags-clipboard.card-width", 260)`. | Remove the read. Use an app-owned `CARD_WIDTH = 260` layout constant in `app.tsx`; update ticket/README/AGENTS. |
| 5 | Selected cards stack the skin base hairline plus an app ring (border + box-shadow). | Selected/focused paint replaces the base border: a `USER + 1` per-widget provider sets `border-color: transparent` and draws exactly one ring/tint. |
| 6 | Per-item type colours could drift into the skin template. | Keep the accent-family mapping
(Text `@primary`, Link `@primary_container`, Code `@secondary_container`,
Image `@secondary`, Color `@tertiary`, Emoji `@tertiary_container`) as
app-owned content paint; the skin only paints role surfaces/base states. |
| 7 | Five skins must remain in scope. | App CSS stays layout + fallback; no skin-specific branches, no appearance token reads, no `surface.overlay`. |

No blocking conflict remains after these decisions. The app-side changes are
staged in this worktree; `dotfiles-assets` is not edited.

## Frozen final (approved 2026-11-09)

This is the final approved design and the **intent** for the feature:

- Design commit: `6242101` (card stage + compact Bottom/Left/Right + Recent/Pinned
  view + tab keys + compact link Open).
- Earlier baseline: `d9ed130` (card stage + pinned copy/collapse + bottom strip);
  kept as history.
- Mock sha256: `9e3f6ecaa396837194697b1d6922d7946677ea18440e4d7b5bb9c2e1fd278d19`
  (recorded in `mock.sha256`).
- The accepted compact extension below is part of this final intent; there is no
  pending proposal.

## Accepted compact extension (part of the frozen final)

Accepted 2026-11-09. This is no longer a proposal; it is part of the final intent
above. The details remain here for review and traceability.

### P1 — compact alignment

- Settings adds `Compact alignment: Bottom / Left / Right` (default `Bottom`).
  The compact alignment and card-size rows are disabled while Layout is Full,
  following the capture-tool sensitivity rule; they enable live when Layout is
  Compact.
- `Bottom` is the current horizontal bottom strip.
- `Left`/`Right` is a vertical compact strip at that edge: full work-area height
  below the desktop bar with a 12 px inset, width derived from the card size plus
  padding. Search, filters, incognito, clear and gear adapt to the narrow column;
  cards stack vertically. Up/down keys and visible up/down affordances navigate
  the vertical strip; left/right remain the bottom-strip navigation. Alignment
  applies live and preserves mode, query, filter and selection. The desktop stays
  visible.
- The real settings shape becomes
  `{ "layout": { "mode": "full", "compact": { "card_size": "medium", "alignment": "bottom" } } }`.
  Defaults remain `full` / `medium` / `bottom`; unknown values degrade to those
  defaults. The mock uses `localStorage`.
- New review link: `?compact_align=bottom|left|right` (all existing links keep
  working, including `?compact_size=small|medium|large`).

### P2 — Recent / Pinned carousel view

- There is **no separate pinned shelf or group**. The compact strip keeps one
  card list; a `Recent | Pinned (n)` tab control sits at the carousel header
  (where the old Recent label lived) in Bottom, Left and Right alignments.
- The active view replaces the card list; only one list is shown. `Recent` shows
  non-pinned cards, `Pinned` shows only pinned cards. If there are zero pins the
  Pinned tab is hidden/disabled and Recent remains active.
- Both views use the same compact card identity and card size; the alignment and
  card-size settings still apply. The strip height and width do not jump when
  switching views.
- Search and type filters apply to the active view, and switching views keeps
  the current query and filter. `Ctrl+1..9` addresses the active view. An
  active Pinned view with no filtered matches shows an honest empty state.
- Pinned cards in this carousel use the same compact behaviour as Recent:
  select, then `Enter` or double-click copies. They are **not** quick-copy cards.
  The full pinned grid remains copy-and-collapse and is unchanged.
- The view defaults to Recent when the overlay opens or the session starts; it
  is not persisted. New review link:
  `?compact_view=recent|pinned` (alongside `?compact_align` and
  `?compact_size`).
- Keyboard key map (compact only; Full keeps its existing `↑`/`↓` pinned-grid
  behaviour):
  - `Tab` / `Shift+Tab`: toggle Recent/Pinned in every alignment. Default focus
    traversal is prevented while compact so the keys act as the view switch;
    search and list stay usable. The settings popover and clear confirmation are
    exempt so their controls remain keyboard-reachable. With zero pins the
    Pinned view cannot be selected, so the view is unchanged.
  - Bottom: `↑` / `↓` also toggle Recent/Pinned; `←` / `→` still move cards.
  - Left/Right: `←` / `→` also toggle Recent/Pinned when the search field is
    not focused; `↑` / `↓` still move cards. When search is focused, `←` / `→`
    move the text cursor normally (Tab still toggles).
  - Hints adapt: Bottom shows `↑↓ view` + `Tab view`; Left/Right shows
    `←→ view` + `Tab view` when not typing, and omits `←→ view` while search is
    focused. The active tab updates immediately and keeps `aria-selected`
    current; query, filter and the active-view selection behaviour are
    preserved.

### P3 — compact link Open

- Every link card in compact mode — Recent or Pinned, Bottom/Left/Right — shows
  a visible `Open` chip under the domain/URL in the card body. It is not
  hover-only and stays readable at all three card sizes.
- The chip stops click propagation: the card selection does not change. It calls
  the same `openLink(item)` path as full mode (the mock keeps the
  `Would open <domain>` toast simulation) and carries an accessible label/title.
- Full mode and the full pinned grid are unchanged; their existing Open controls
  remain.

### Extension acceptance (checked; part of the final intent)

- [x] Settings shows `Compact alignment: Bottom / Left / Right`; card-size and
      alignment rows are disabled in Full and enabled in Compact.
- [x] Bottom/Left/Right apply live, persist through the extended settings shape,
      and preserve mode, query, filter and selection.
- [x] Left/Right render a full-work-area vertical column with 12 px inset and
      width derived from the card size; controls adapt; up/down (keys and
      affordances) navigate; left/right stay for Bottom.
- [x] Compact shows a `Recent | Pinned (n)` view switch at the carousel header
      in every alignment; the active view replaces the card list and both views
      use the same card identity and size with no height/width jump.
- [x] Recent excludes pinned cards; Pinned shows only pinned cards; zero pins
      hides/disables Pinned and keeps Recent.
- [x] Search and filters apply to the active view and survive view switches;
      `Ctrl+1..9` addresses the active view; filtered-empty states are honest.
- [x] Pinned carousel cards use the same select / `Enter` / double-click copy
      behaviour as Recent; the full pinned grid keeps copy-and-collapse.
- [x] Keyboard view switching works: `Tab`/`Shift+Tab` in every compact
      alignment, Bottom `↑`/`↓`, and Left/Right `←`/`→` only when search is not
      focused (search editing wins). Zero pins make the switch a no-op; hints
      adapt; query/filter persist; the active view keeps `Ctrl+1..9`.
- [x] Full mode is isolated: its `↑`/`↓` pinned-grid behaviour and normal `Tab`
      traversal are unchanged.
- [x] Compact link cards show a visible Open chip in both views and every
      alignment; non-link cards do not. Clicking it does not change selection
      and invokes the full-mode link-open path; Full mode/full pinned grid are
      unchanged.
- [x] `?compact_view=recent|pinned`, `?compact_align=bottom|left|right` and all
      existing deep links work; the view is not persisted.
- [x] Extension accepted; the frozen final section and `mock.sha256` were
      updated together, and the design was merged.

## Interaction

### Full mode

- Top row: `Clipboard` + item count, a `Pinned (n)` pill that opens the grid,
  and a settings gear. No search in full mode; search belongs to compact.
- Stage: one focused card; previous/next peek cards are clickable. Circular
  left/right arrows sit at the stage edges.
- Header identity is the type colour: glyph, type label, relative time (and a
  pin mark when pinned). Preview body keeps the REQ-005 previews: text readable,
  code monospace, image large, colour swatch + hex/RGB/HSL, link domain + URL,
  emoji large.
- `←`/`→` move through all cards with wrap-around. `↑` opens the pinned grid;
  inside the grid `←`/`→` move a focused pin, `Enter` copies it and collapses
  the overlay, and `↓`/`Esc` returns to the stage. `Enter` copies from the
  stage; `Ctrl+F` pins/unpins; `Delete` deletes with undo; `Ctrl+Z` undoes;
  `Esc` closes the overlay.
- Bottom control bar: `n / total`, current type and time, `Copy`, `Pin`/`Unpin`,
  `Delete`, `Open` (links only), and the hints `← → cards · ↑ pinned · ↓ back`.
- Pinned grid: a full-window 4-column grid of smaller current-style cards,
  headed `Pinned · n` with the hints `← → select · ↵ copy · ↓ back`. It keeps a
  focused-pin state: the current stage card when that card is pinned, otherwise
  the first pin. `←`/`→` move that focus with wrap-around, a clear type-coloured
  focus ring and scroll-into-view; they never move the stage deck while the grid
  is open. `Enter` copies the focused pin and collapses the whole overlay; it
  does **not** open the pin in the stage. `↓`/`Esc`/Back return without copying;
  clicking any pinned card copies it and collapses. With no pins the arrows are
  no-ops and the empty state is unchanged; with one pin it is focused and
  `Enter` copies it.

### Compact mode

- Bottom-anchored, full-width strip; the desktop above stays visible. Top row:
  search, type filter (All / Text / Links / Code / Images / Colors / Emoji),
  incognito, clear, settings.
- The strip keeps the current 260 px card identity: type-coloured header (index,
  glyph, type, time, pin), type preview, horizontal scroll plus arrows.
- Click selects, double-click or `Enter` copies. `←`/`→` move, `Ctrl+1..9`
  copy by visible position, `Ctrl+F` pins, `Delete` deletes with undo, `/`
  focuses search, `Esc` closes.
- Live captures appear without changing the selection; a `n new` badge offers
  to jump to them.
- Clear is confirmed inline. Empty and no-match states are honest.

### Shared settings

- Gear opens a popover with `Layout: Full / Compact` and
  `Compact card size: Small / Medium / Large` (220 / 260 / 300 px).
- Changes apply live and persist. The old `compact.position` setting is removed;
  compact is always the bottom strip.
- Real contract: `$XDG_CONFIG_HOME/clipboard-ui/config.json`

  ```json
  { "layout": { "mode": "full", "compact": { "card_size": "medium", "alignment": "bottom" } } }
  ```

  Defaults are `full` / `medium` / `bottom`. Unknown values degrade to the
  defaults. The implementation uses the capture-tool pattern: pure domain +
  port + GLib adapter, save-on-change. This is **not** the daemon's
  `clipboard/config.json` and **not** an AGS link. The mock uses `localStorage`.

### Visual language

Inherit the 106/107 tokens: glass, one hairline, one soft shadow, accent only
for state/action, 8 px rhythm, sentence case, 40–44 px targets. The type-coloured
card header is deliberately retained as the identity; type hue annotates, it
does not frame the surface.

## Acceptance

- [x] `mock.html` is self-contained (no external assets, build step or network
      requests) and opens directly in a browser.
- [x] Full mode matches the card-stage description: dimmed desktop, one focused
      card, side peeks, arrows, count/type/time and the bottom control bar.
- [x] Pinned grid opens with `↑`/the pill and returns with `↓`/`Esc`/Back. A
      focused pin (current stage card when pinned, else the first pin) is
      highlighted; `←`/`→` wrap through the pins, scroll it into view and never
      move the stage deck; `Enter` copies the focused pin and collapses the
      overlay; clicking copies and collapses too. Empty and single-pin grids
      behave as specified.
- [x] Compact mode keeps the current card identity at 220/260/300 px, with
      search, filter, incognito, clear, pin/delete and live updates; it supports
      Bottom/Left/Right alignment, the Recent/Pinned view, keyboard view
      switching and compact link `Open`.
- [x] Settings apply live and persist through the documented
      `clipboard-ui/config.json` shape (mock: `localStorage`), including
      `compact.alignment`.
- [x] All documented deep links work: `?mode=full|compact`, `?card=<kind|n>`,
      `?pins=1`, `?settings=1`, `?compact_size=small|medium|large`,
      `?compact_align=bottom|left|right`, `?compact_view=recent|pinned`,
      `?empty=1`, `?closed=1`.
- [x] A DOM/state harness and `node --check` pass for the mock, including the
      pinned-grid focus, wrap, copy+collapse, back, stage-isolation, click,
      empty and single-pin cases, plus compact alignment, view switching, tab
      keys and compact link Open.
- [x] Final design approved and frozen: commit `6242101`, sha256
      `9e3f6ecaa396837194697b1d6922d7946677ea18440e4d7b5bb9c2e1fd278d19`.
      The accepted compact extension is part of the intent.
- [x] Implementation in the app: full stage, compact strip (Bottom/Left/Right),
      Recent/Pinned view, tab keys, compact link Open, settings adapter,
      persistence, all preserved behaviours.
- [x] `make ci` / `make gates` pass in the ticket worktree (evidence below).
- [ ] The composition pin is bumped (release/composition lane; explicitly out
      of scope for this app worktree — do not bump here).

## Implementation evidence (2026-11-20)

Worktree `.worktrees/REQ-009`, branch `ticket/REQ-009-clipboard-card-modes`.
Merged `main` at `8ed90d6` (fast-forward from `bc4e2a2`) before implementation.

| Command | Result |
| --- | --- |
| `make test` | exit 0 — 28 tests pass (settings domain/port, deck/view/selection/pinned-focus, appearance order, request dispatch, header/type-role gates) |
| `CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts make conformance` | exit 0 — 40 tests pass (manifest identity, in-page settings/catcher, stable full-monitor anchor + input region, no Popover, app-owned card width, one content-accent provider at USER+1, incremental compact selection/shell, full fixed stage + link caps, pin centering, full clear/search/filter, compact Enter collapse, pinned overlay, save-on-change, compact Open chip/view keys, owner-feedback regressions, CSS validity, accent-family headers, skin/focus/pin geometry, template gate, refresh invariants) |
| `CONTRACTS_ROOT=... make drift` | exit 0 — "all checks passed" against contracts v0.12.0 |
| `make typecheck` | exit 0 — `OK: 0 errors in the ags-clipboard tree` (27 tolerated `/usr/share/ags/js` errors, 0 platform) |
| `make bundle` | exit 0 — `build/ags-clipboard.js` (1,324,796 bytes) |
| `CONTRACTS_ROOT=... make gates` | exit 0 — all of the above (28 unit + 40 conformance, drift "all checks passed", bundle 1,324,796 bytes, 0 type errors) |

Implementation map:

- `lib/settings.ts`, `lib/settings-store.ts`, `lib/settings-glib.ts` — pure
  settings domain, injected port, GLib adapter at
  `$XDG_CONFIG_HOME/clipboard-ui/config.json`.
- `lib/card-modes.ts` — pinned-first deck, Recent/Pinned filtering, compact
  selection, pinned-grid focus/wrap and copy target.
- `lib/history.ts` — `restoreItem` and deferred image purge for delete/undo.
- `ui/ClipboardWindow.tsx` — both layouts, key map, live updates (selection
  preserved, `n new` badge), inline clear, settings popovers, window
  anchor/margins per layout/alignment.
- `ui/ItemCard.tsx` — shared identity header, compact card with visible `Open`
  chip, stage card, peek card and pinned card.
- `ui/Preview.tsx` — stage-scale previews (large image/code/emoji, link
  domain + URL, colour hex/RGB/HSL).
- `style.css` — bundled fallback for the new surface.
- Tests: `tests/unit.test.mjs` (settings + mode/selection), updated
  `tests/app-contract.test.mjs` and
  `tests/validation/appearance-migration.test.mjs`.

Known deviations / follow-ups:

- Full mode dims the desktop with the overlay's scrim; it cannot blur the
  desktop itself from an app-owned layer surface. Compact leaves the desktop
  visible and sharp.
- Skin paint: new selectors are listed in the follow-up section below; this
  lane did not edit `dotfiles-assets/skins/templates/ags-clipboard.gtk.css.j2`.
- Runtime behaviour was exercised by the local gates (typecheck/bundle), not by
  a headless GTK session; visual pixel-parity with the mock is a review step.

### Skin handoff (117 batch; not edited in this lane)

Canonical file: `dotfiles-assets/skins/templates/ags-clipboard.gtk.css.j2`.
Clipboard is a layer-shell overlay, so the outer role is **`surface.panel`**
(assets v0.22.3). Do not use `surface.overlay` / contracts v0.14.0 / assets
v0.23.0.

**Remove from the skin template (content accents/layout):**

```text
.clipboard-head.on-dark
.clipboard-head.on-light

.kind-text .clipboard-head
.kind-link .clipboard-head
.kind-code .clipboard-head
.kind-image .clipboard-head
.kind-color .clipboard-head
.kind-emoji .clipboard-head

.kind-text.selected
.kind-link.selected
.kind-code.selected
.kind-image.selected
.kind-color.selected
.kind-emoji.selected

.kind-text.clipboard-pin-card.focused
.kind-link.clipboard-pin-card.focused
.kind-code.clipboard-pin-card.focused
.kind-image.clipboard-pin-card.focused
.kind-color.clipboard-pin-card.focused
.kind-emoji.clipboard-pin-card.focused

.kind-text .clipboard-pin-button
.kind-link .clipboard-pin-button
.kind-code .clipboard-pin-button
.kind-image .clipboard-pin-button
.kind-color .clipboard-pin-button
.kind-emoji .clipboard-pin-button

.clipboard-filter-dot.kind-*
.clipboard-type-dot.kind-*

.clipboard-card { min-width: 260px; }   /* layout; app owns */
```

**Skin owns role surfaces/base states (paint only):**

```text
window#clipboard-window            /* surface.panel bg/ink/radius/border */
.clipboard-root                    /* surface.panel */
.clipboard-full, .clipboard-compact
.clipboard-control-bar, .clipboard-pins-panel
.clipboard-card                     /* base surface.card bg/border/radius */
.clipboard-stage-card, .clipboard-peek-card, .clipboard-pin-card
.clipboard-search-box, .clipboard-search
.clipboard-chip, .clipboard-view-tab
.clipboard-gear, .clipboard-bar-button, .clipboard-pins-pill
.clipboard-nav-arrow, .clipboard-strip-arrow
.clipboard-settings                 /* in-page settings role surface */
.clipboard-settings-catcher         /* transparent catcher; no paint needed */
.clipboard-open-chip, .clipboard-keycap
```

The app owns content accents (headers, type/filter dots, selected/focused
rings, pin fills) via per-widget providers at `USER + 1`; they must not be
duplicated in the skin. Selected/focused providers set `border-color:
transparent` and draw one ring, replacing the skin base hairline.

## Batch implementation (2026-11-21)

App-side batch work, staged in this worktree only (no assets/provision/composition
changes, no tag).

- **Outer role:** clipboard remains an AGS layer-shell overlay mapped to
  **`surface.panel`**. No `surface.overlay`, no contracts v0.14.0 / assets
  v0.23.0.
- **Settings:** removed `Gtk.Popover`/`Gtk.MenuButton` entirely. One in-page
  `.clipboard-settings` panel sits over a full-window
  `.clipboard-settings-catcher` inside the overlay. Gears are plain buttons.
  Esc/outside click close; changes save immediately. For compact mode the same
  window temporarily anchors full-monitor while settings are open, with the
  strip pinned at the bottom, so the panel is never clipped; closing restores
  the compact anchor.
- **Layout token:** `app.tsx` now uses an app-owned `CARD_WIDTH = 260`; there is
  no `appearance.value(...)` read. README/AGENTS state the batch rule.
- **Content accents:** type header plates, type/filter dots, pin fills,
  selected/focused rings are app-owned content. They are painted by per-widget
  `Gtk.CssProvider` providers at `Gtk.STYLE_PROVIDER_PRIORITY_USER + 1`
  (`lib/type-accents.ts`, `ui/accent.ts`) so they win over skin role rules.
  Selected/focused providers set `border-color: transparent` and draw exactly
  one ring; they never stack on the skin hairline.
- **Skin boundary:** the skin template keeps role surfaces/base states only.
  It must remove the six per-kind header plates, `on-dark`/`on-light` classes,
  six per-kind `.selected` rules, six per-kind focused rules, any per-kind pin
  fills, the type/filter dot selectors, and the `.clipboard-card
  { min-width: 260px }` layout rule.
  It should paint `.clipboard-root`/`window#clipboard-window` as
  `surface.panel`, plus the role surfaces listed in the skin follow-up section.
- **Tests:** conformance now rejects `Gtk.Popover`/`MenuButton` in the overlay,
  asserts the in-page catcher/panel, asserts the app-owned constant and no
  `appearance.value`, and asserts the content-accent providers at USER + 1.
  Existing per-kind header/selection/focus/pin assertions remain.
- **Gates (app worktree):** `make test` 28 pass; `make conformance` 34 pass;
  `make drift` all checks passed; `make typecheck` 0 app errors; `make bundle`
  1,324,796 bytes; `make gates` green. Final numbers in the Evidence table.
- **Visual checks that still need the skin lane:** four-column pinned geometry
  under each of the five skins, settings panel/catcher paint, gear hover, and
  the one-ring selected state after the skin template removes its base
  duplicate/old per-kind rules.

## Full layout follow-up (2026-11-22)

Owner feedback on the full stage.

- **Standard stage size:** `StageCard` now returns a fixed-size `Gtk.Fixed`
  frame (`width × height`) with the card clipped inside, so a child's natural
  width can never widen the stage. Link stage labels cap `width_chars` /
  `max_width_chars` from the actual body width, wrap to 2 lines, ellipsize END
  and align start. Text/code stage labels wrap without ellipsize, cap at 8/10
  lines, and render the full item text (not just the first line). Evidence:
  conformance test `stage cards are fixed-size and link/code labels are
  width-capped`; live `/tmp/req009-shots/full-code2.png`.
- **Pin centering:** the 22×22 pin button wraps its glyph in a
  `Gtk.CenterBox` with a centered child in both axes. Evidence: test `pin
  button centers a single child`.
- **Pinned view:** the overlay panel explicitly fills both axes and the grid
  spans the full panel width (4 homogeneous columns), with the stage dimmed
  behind. Evidence: test `pinned panel fills the full stage`; live
  `/tmp/req009-shots/full-pins.png`.
- **Full Clear:** toolbar `Clear` + inline `Clear all? No/Yes` confirm using
  the shared `clearConfirm` state. No popover. Evidence: test `full layout has
  synced search/filter and inline clear`.
- **Full search/filter:** top bar now has a search box and the same type chips
  immediately left of the gear. Query/filter state is shared with compact
  (one `query`/`filter`, synced entries/chips). `/` focuses the active search
  (full or compact) and both search boxes show a `/` keycap. Evidence: same
  test, plus `keycap("/")` count.
- **Enter:** compact Enter now copies the selected item and collapses the
  overlay exactly like full mode (both the typing and final Enter branches);
  Ctrl+1..9 and double-click remain copy-only. Hints read `copy+close`.
  Evidence: conformance test `Enter copies and collapses in full and compact`.
- **Settings footer removed:** config-path/“Saved on change” footer removed
  from the panel; persistence unchanged. Evidence: test asserts the footer is
  absent.
- Gates: `make test` 28, `make conformance` 39, drift/typecheck/bundle/gates
  green. Live full-mode screenshots:
  `/tmp/req009-shots/full-fix.png` (image), `full-code2.png` (code),
  `full-pins.png` (pinned), no CSS/JS errors.

## Settings-open stability (2026-11-22)

Owner: the gear caused a blink/layout shift because `applyWindowLayout()`
re-anchored the compact layer-shell surface from strip/column geometry to
full-monitor on open, then back on close.

- The layer-shell window is now **stable full-monitor for every mode**:
  `TOP|BOTTOM|LEFT|RIGHT`, margin 0, set once at construction and reasserted
  idempotently. Settings open/close and alignment changes never change the
  anchor or margins.
- `.clipboard-compact` is positioned inside that transparent surface:
  - bottom: `halign=FILL`, `valign=END`, 12 px start/end/bottom margins;
  - left: `halign=START`, `valign=FILL`, width `compactWidth()`, 12 px
    left/bottom margins, 52 px top;
  - right: `halign=END`, `valign=FILL`, width `compactWidth()`, 12 px
    right/bottom margins, 52 px top.
- Input is restricted while settings is closed:
  `overlay.get_surface()?.set_input_region(...)` with a `cairo.Region`
  union-rectangle from `compactRoot.get_allocation()`. Full mode and
  compact+settings open use `set_input_region(null)` so the catcher/panel
  receive input. The region is refreshed after map, `applyCompactShell()`,
  alignment/size changes, settings open/close and via an idle tick.
- Settings open/close only toggles the catcher/panel visibility; the shell
  helper repositions the strip without re-anchoring the window.

**Live observations:**

```text
input-region compact x=12 y=715 w=1860 h=280   # settings closed
input-region full mode=compact settings=true    # settings open -> whole window
```

- No CSS/JS errors in the preview logs, settings open/close, or compact
  left/right.
- Settings-open compact bottom: panel fully inside monitor, strip pinned at the
  bottom (`/tmp/req009-shots/stable-settings-bottom3.png`).
- Compact Left/Right remain full-height with visible stacked cards
  (`/tmp/req009-shots/r5-left.png`, `/tmp/req009-shots/r5-right.png`).
- No window remap/flash was observed on gear open/close after the stable
  anchor change.

## Live feedback round (2026-11-22)

Owner tested the preview after the batch build.

### 1-2. Compact Left/Right tiny; Left→Right stale bottom layout

- **Cause:** `compactSpacer` was visible in every compact mode and expanded
  before `compactRoot`, pushing vertical columns to the bottom; `compactRoot`
  had `vexpand=false` and no alignment/width reset, so alignment changes kept
  stale shell geometry.
- **Fix:** one `applyCompactShell()` helper owns the full compact shell:
  vertical → spacer hidden, `vexpand=true`, `valign=FILL`, width
  `compactWidth()`, `hexpand=false`, `halign=START/END`; bottom → spacer
  visible, `vexpand=false`, `valign=END`, `halign=FILL`, `hexpand=true`; plus
  list orientation, scroll policies, search/filters and arrow visibility. It is
  called by `applyMode()`, `renderCompact()` and every alignment change.
- **Evidence:** `ui/ClipboardWindow.tsx` `applyCompactShell`; conformance test
  `compact selection is incremental and shell resets on alignment`.
- **Live:** Left and Right at 1920×1080 render full-height columns with visible
  stacked cards (`/tmp/req009-shots/r5-left.png`,
  `/tmp/req009-shots/r5-right.png`).

### 3. Massive lag on filter/Esc/arrow keys

- **Cause A:** per-widget `Gtk.CssProvider` on every header/dot/pin/card on
  every render caused repeated style invalidation.
- **Fix A:** one display-wide content provider at `USER + 1`
  (`installContentAccents` → `Gtk.StyleContext.add_provider_for_display`) with
  all per-kind content rules. Per-widget paint calls/cache removed.
- **Cause B:** compact arrow selection rebuilt every card (`renderCompact`).
- **Fix B:** `compactCards: Map<key, widget>` + `selectCompactKey` toggles
  `.selected` on the previous/next card and scrolls; no rebuild on movement.
  Filter/search/view changes still rebuild; `copyOnly` and Esc/hide no longer
  rebuild.
- **Evidence:** `lib/type-accents.ts` `contentAccentCss`, `ui/content-accent.ts`,
  `selectCompactKey`; conformance tests `type accents use one app-owned display
  provider at USER + 1` and `compact selection is incremental and shell resets
  on alignment`.
- **Live timing:** 100 incremental selection moves (including scroll) measured
  **7 ms** total in the preview log (`bench-select 100 moves: 7ms`; temporary
  instrumentation removed).

### 4. Settings open showed compact bottom layout at top

- **Cause:** the full-monitor settings-open anchor was combined with stale
  shell alignment/valign/spacer state.
- **Fix:** the same `applyCompactShell()` runs while settings are open: compact
  bottom keeps spacer+`valign=END` so the strip stays at the bottom; vertical
  keeps `vexpand=true` so the column stays full height. The panel remains an
  overlay top-right, fully inside the monitor.
- **Live:** `/tmp/req009-shots/r5-settings-bottom.png` shows the panel fully
  inside the monitor with the compact strip pinned at the bottom.

### Batch constraints retained

`surface.panel` only (no `surface.overlay`/assets v0.23.0), no `Gtk.Popover`
or `MenuButton`, no `appearance.value` (`CARD_WIDTH` app-owned), one app-owned
content provider at `USER + 1`, and one-ring selected/focused paint replacing
the skin hairline.

## Feedback round 1 (2026-11-20)

Owner live-test feedback against HEAD `9331c25`. Each item records the
before-state (code at that HEAD), the fix and the check that keeps it fixed.
Static invariants are covered by `tests/app-contract.test.mjs`; live-only
checks list the manual resolution and screenshot path.

### 1. Settings was a container within a container

- **Before:** `buildSettingsPopover` created a bare `Gtk.Popover` and only
  margin-padded `.clipboard-settings`; the popover node and the content box
  both drew a rounded/shadowed frame.
- **After:** the popover carries `clipboard-settings-popover`; CSS resets the
  popover, `contents` and `arrow` nodes to transparent/no border/no padding/no
  shadow, and `.clipboard-settings` is the single glass surface (surface fill,
  1 px hairline, 15 px radius, 14 px padding, one shadow). The panel now has
  the mock's `Settings` + `Layout` head, label + description rows, separators,
  a subtle segment track, disabled size/alignment rows in Full, and the
  config-path footer.
- **Evidence:** `ui/ClipboardWindow.tsx` `buildSettingsPopover`;
  `style.css` `.clipboard-settings-popover` reset + `.clipboard-settings`;
  conformance test `settings has one visible frame and the mock's anatomy`.

### 2. Settings clipped when changing compact alignment

- **Before:** `setCompactAlign` changed the window anchor while the popover was
  still open, so MenuButton kept the old geometry and the popover was cut by
  the monitor edge.
- **After:** every layout/size change closes the open settings popover before
  `applyMode()` re-anchors the window, then reopens it on the new gear in a
  `GLib.idle_add` callback. The popover position is set from the active
  alignment (`TOP` bottom strip, `RIGHT` left column, `LEFT` right column,
  `BOTTOM` full stage).
- **Evidence:** `closeSettingsForLayout` / `reopenSettingsAfterLayout`;
  conformance test `settings closes before a layout change and reopens after
  settle`.
- **Manual check (not run in this lane; live pass required):** at 1600×1000
  and 1280×800, open compact settings and step Left→Bottom, Bottom→Left,
  Left→Right and Right→Bottom. The popover must remain fully inside the
  monitor. Screenshot target:
  `tickets/REQ-009-clipboard-card-modes/screenshots/feedback-1/settings-<from>-<to>-<resolution>.png`.

### 3. Compact card size did not change card width

- **Before:** `style.css` `.clipboard-card { min-width: 260px; }` clamped
  Small (220) up to 260, so Small and Medium looked identical.
- **After:** the clamp is removed. The card is sized by the settings token
  (220/260/300), the preview's character cap scales with the requested body
  width, vertical columns set their content width from the active card size,
  the search box follows that width, and the trailing list spacer exists only
  in the horizontal strip so it cannot stretch cards.
- **Evidence:** `ui/ClipboardWindow.tsx` `renderCompact`
  (`compactRoot.set_size_request`, `searchBox.set_size_request`, spacer only
  when `!vertical`); `ui/Preview.tsx` width-derived character cap;
  conformance test `compact cards use the exact size token and vertical
  columns resize`.
- **Manual check:** Small/Medium/Large in Bottom/Left/Right must measure
  220/260/300 px; the vertical column width must track the selected size.
  Screenshot target: `.../feedback-1/cards-<size>-<alignment>.png`.

### 4. Nav arrows were tall pills

- **Before:** only min sizes existed (`38px` full, `32px` strip), and no
  alignment/expand guard, so buttons filled the cross-axis.
- **After:** both full arrows are `46×46`, all four strip arrows are `32×32`,
  with `hexpand/vexpand = false`, `halign/valign = CENTER` and CSS
  min/max widths and heights plus `border-radius: 999px`.
- **Evidence:** `ui/ClipboardWindow.tsx` arrow sizing loop; `style.css`
  `.clipboard-nav-arrow`, `.clipboard-strip-arrow`; conformance test `nav and
  strip arrows have fixed circular sizes`.

### 5. Pin functionality / pin icon missing

- **Before:** `ItemHead` supported a pin button, but `ItemCard`, `StageCard`,
  `PeekCard` and `PinCard` omitted `onTogglePin`, so only already-pinned cards
  showed a static mark.
- **After:** every card builder accepts and forwards `onTogglePin`, the window
  passes `togglePin`, and each header shows an active pin control. A
  capture-phase child guard marks pin/Open clicks as claimed so the card
  gesture does not also select/copy/collapse. `PeekCard` and `PinCard` are now
  plain boxes with gestures rather than nested GTK buttons.
- **Evidence:** `ui/ItemCard.tsx` `HeadOptions.suppress`, `guardChildClick`,
  all four card builders; `ui/ClipboardWindow.tsx` render call sites;
  conformance test `every card kind wires the pin control and guards its
  click`.

### 6. No icons on Incognito / Clear

- **Before:** both compact buttons were label-only `Gtk.Button`s.
- **After:** Incognito is `[pause|play icon] + Incognito: off|on`; Clear is
  `[trash icon] + Clear`, both built through `uiIcon` with local fallbacks
  (`media-playback-pause-symbolic`, `media-playback-start-symbolic`,
  `user-trash-symbolic`). Icons are recreated on every `renderCompact`, so an
  appearance refresh repaints them from the new palette. Tooltips update with
  the incognito state.
- **Evidence:** `iconTextButton`; `ui/ItemCard.tsx` fallback map; render
  `setIcon` calls; conformance test `compact actions and filter chips carry
  semantic icons and dots`.

### 7. Filter chip dots missing

- **Before:** chips were label-only.
- **After:** every type chip except `All` has a 6 px dot using the card kind's
  semantic role class (`kind-text` → `@tertiary`, `kind-code` →
  `@surface_container_lowest`, `kind-color` → `@error`, `kind-image` →
  `@error_container`, `kind-link` → `@primary`, `kind-emoji` → `@secondary`).
  Dots remain visible in horizontal and vertical compact layouts.
- **Evidence:** chip construction in `ui/ClipboardWindow.tsx`;
  `style.css` `.clipboard-filter-dot.kind-*`; conformance test above.

### 8. Full bar icons, keycaps and Ctrl+Enter open

- **Before:** the bar used plain text buttons; the Pin label was replaced at
  render time and there was no Ctrl+Enter path.
- **After:** Copy is `copy icon + Copy + ↵`; Pin is `pin icon + Pin/Unpin +
  Ctrl+F`; Delete is `trash icon + Delete + Del`; Open is `external icon +
  Open` and only visible for links. Button content is built once and icons are
  refreshed on each render, so no duplicate/ghost child remains. `Ctrl+Enter`
  opens the selected link (hides the overlay and hands off to `openUrl`) in
  full and compact; plain `Enter` keeps copy semantics. Hints name the real
  bindings.
- **Evidence:** `barButton` and the four bar controls in
  `ui/ClipboardWindow.tsx`; `onKey` Ctrl+Enter branch; conformance test `the
  full bar has icon + keycap controls and Ctrl+Enter opens links`.

### 9. Pinned view looked nothing like the mock

- **Before:** opening pins hid the stage and replaced the window content with
  a sparse padded grid.
- **After:** the root is a `Gtk.Overlay`; the stage stays mounted behind a
  translucent scrim overlay. The pinned surface uses the mock inset (104 px
  top, 24 px sides, 20 px bottom), header `Pinned · n` with key hints,
  `Click a card to copy it`, a Back control with `Esc` keycap, a
  homogeneous 4-column grid with 236 px rows and 16 px gaps, 17 px card
  radius, header/body cards, and a type-coloured focus ring plus soft outer
  ring. `←`/`→` wrap, `Enter` copies and collapses, `↓`/`Esc`/Back return;
  empty and single-pin states stay honest.
- **Evidence:** `ui/ClipboardWindow.tsx` `Gtk.Overlay` root, `applyMode`,
  `renderPins`, `pinsBackBar`; `style.css` `.clipboard-pins-panel`,
  `.clipboard-pins-grid`, `.clipboard-pin-card`; conformance test `the pinned
  view is an overlay over the stage with the mock geometry`.
- **Manual check:** at 1600×1000 and 1280×800, press `↑` from the stage and
  confirm the stage remains visible under the scrim, focus wraps, `Enter`
  copies+collapses, and `↓`/`Esc`/Back restore the stage. Screenshot target:
  `.../feedback-1/pins-<resolution>.png`.

## Feedback round 2 (2026-11-20)

Owner live-test feedback after round 1. The owner had already removed the
unsupported `max-width`/`max-height` lines locally; that change is folded into
this round's commit.

### A. CSS validity / app startup

- **Symptom:** `ags run -d .` logged `CSS Error :373 No property named
  "max-width"`, `:374 max-height`, `:765 max-width`, `:766 max-height`; the app
  appeared to stop working.
- **Cause:** GTK 4 CSS has no `max-width`/`max-height`. The round-1 arrow fix
  used them to cap button size.
- **Fix:** the `max-*` declarations are gone. Arrow size is enforced by
  `set_size_request(46,46)` / `(32,32)` plus `halign/valign = CENTER` and
  `vexpand = false`. The `background:` shorthand was also replaced with
  `background-color:` for GTK consistency. A regression test scans the
  stylesheet for `max-width`, `max-height` and the other web-only properties we
  do not use.
- **Live evidence:** after `ags quit -i clipboard` (the running instance was
  the dev `ags run -d .` from this worktree):
  - `timeout 12s ags run -d .` → exit `124` (still alive at timeout), empty
    log, `grep "CSS Error"` → none.
  - Background start → `ags list` shows `clipboard`, process alive; `ags quit
    -i clipboard` → process exits cleanly.

### B. Gear icon / hover

- **Symptom:** gear hover drew a rounded-square outline/background that did not
  follow the skin/Hyprland rounding.
- **Cause:** `Gtk.MenuButton` contains a child `button` node; only the
  menubutton was styled, so theme button paint leaked through.
- **Fix:** gear is 38×38 with 10 px radius, transparent by default, no border
  and no shadow. Both `menubutton.clipboard-gear` and
  `.clipboard-gear > button` are neutralized; hover uses
  `alpha(@on_surface, 0.08)` plus a 1 px `@primary` ring, active uses
  `alpha(@primary, 0.18)` and the accent ring. No fixed chrome hex.
- **Evidence:** `ui/ClipboardWindow.tsx` gear `set_size_request(38,38)`;
  `style.css` gear selectors; conformance test `gear and pin controls are
  square and skin-neutral by default`.

### C. Pin button square

- **Symptom:** the pin icon/button stretched into a tall rounded rectangle.
- **Cause:** the header is 36 px tall and the pin button had no explicit size
  or vertical alignment.
- **Fix:** `ItemHead` sets `set_size_request(22,22)`, `hexpand/vexpand=false`,
  `halign/valign = CENTER`; CSS keeps 22×22, 6 px radius, transparent default,
  hover fill only, and an active/pinned `@primary` tint. The capture-phase
  click guard still prevents pinning from selecting/copying/collapsing.
- **Evidence:** `ui/ItemCard.tsx` pin button construction; `style.css`
  `.clipboard-pin-button`; conformance test above.

### D. Cards follow skin / Hyprmod radii and accent

- **Symptom:** card highlight colours looked hardcoded/per-kind and card
  rounding did not read as skin-driven.
- **Cause:** six `.kind-*.selected` rules painted selection with the type hue;
  six `.kind-*.clipboard-pin-card.focused` rules did the same for pin focus.
- **Fix:** selection is now one shared `.clipboard-card.selected` rule and pin
  focus is one shared `.clipboard-pin-card.focused` rule, both using `@primary`
  plus `alpha(@primary, ...)`. Type roles remain only on the header plate
  (`.kind-* .clipboard-head`) and filter dots. No `#` hex colours exist in the
  stylesheet; chrome uses palette roles. Radii remain app-fallback values in
  `style.css` and are listed for the skin lane to override with
  Hyprmod/Hyprland values.
- **Evidence:** `style.css` `.clipboard-card.selected`,
  `.clipboard-pin-card.focused`; conformance tests `fallback chrome has no
  hard-coded hex colors and uses the accent role` and `the pinned view is an
  overlay over the stage with the mock geometry`.

### Remaining visual checks

- Gear hover shape and skin radii on a live compositor.
- Pin squareness on stage, peek, compact and pinned cards.
- Selection/focus accent under the active skin.
- Screenshot target:
  `tickets/REQ-009-clipboard-card-modes/screenshots/feedback-2/`.

## Feedback round 3 (2026-11-20)

Owner live-test feedback after round 2. This round fixes behaviour and actual
widget geometry, not just property presence.

### 1. Pin background — visible square control

- **Cause:** round 2 made the pin control fully transparent, which the owner
  rejected.
- **Fix:** the pin is a real 22×22 square centered in the header: 6 px radius,
  visible rest fill, stronger hover fill, and an active/pinned fill. Header
  plates with non-neutral ink use that plate's `on_*` role
  (`@on_tertiary`, `@on_error`, `@on_error_container`, `@on_primary`,
  `@on_secondary`); neutral/code headers use `@on_surface`. This keeps the
  fill visible on both light and dark type headers without fixed hex.
- **Evidence:** `ui/ItemCard.tsx` pin button size/alignment; `style.css`
  `.clipboard-pin-button` and per-kind fills; conformance test `gear and pin
  controls are square and skin-derived`. Live screenshots show the square on
  compact and pinned cards.

### 2. Compact keyboard navigation

- **Cause:** compact called `search.grab_focus()` on map, so the `typing`
  branch consumed arrows and returned before navigation.
- **Fix:** no search autofocus on open. A focusable paint-free root receives
  focus instead, so arrows reach the compact key map. `/` or a click focuses
  the entry; while the entry is focused, normal text editing wins. Compact
  movement now wraps (`moveCompactSelection`) instead of clamping, and
  `selectByKey(..., true)` scrolls the selection into view.
- **Evidence:** `ui/ClipboardWindow.tsx` map handler/root focus and `onKey`;
  `lib/card-modes.ts` wrap; unit test `compact selection wraps and recovers
  from a stale key`; conformance test `compact opens without focusing search
  and arrows stay reachable`. Live run confirmed `search.has_focus=false` on
  compact open (temporary instrumentation, removed before commit).

### 3. Search/filter focus follows the skin

- **Cause:** the inner `Gtk.Entry` drew its own square focus outline inside the
  rounded search box; chips used neutral chrome for selected state.
- **Fix:** `notify::has-focus` adds/removes `focused` on
  `.clipboard-search-box`; the box draws the accent ring and keeps the pill
  radius. `entry.clipboard-search` focus/outline/box-shadow is neutralized.
  Filter chips use `@primary` fill/border on selection and the same 999 px pill
  radius.
- **Evidence:** `ui/ClipboardWindow.tsx` `notify::has-focus`; `style.css`
  `.clipboard-search-box.focused`, `.clipboard-search:focus`,
  `.clipboard-chip.selected`; conformance test `search focus ring lives on the
  rounded box, not the inner entry`.

### 4. Per-kind card highlight restored

- **Cause:** round 2 wrongly collapsed every selection to `@primary`.
- **Fix:** six `.kind-*.selected` rules and six
  `.kind-*.clipboard-pin-card.focused` rules again use the type roles
  (`@tertiary`, `@surface_container_lowest`, `@error`, `@error_container`,
  `@primary`, `@secondary`) with subtle fills and soft outer rings. No hex.
- **Evidence:** `style.css`; conformance test `fallback chrome has no
  hard-coded hex colors and keeps per-kind rings`.

### 5. Removed unrequested counters

- **Cause:** the compact header showed a `N new` badge and a `N recent/pinned`
  status label that the owner did not ask for.
- **Fix:** both widgets, their CSS, `jumpToNewest`, and the now-unused
  `newKeys` bookkeeping were removed. Recent/Pinned tabs remain.
- **Evidence:** conformance test `compact view has no duplicate new/recent
  counters`.

### 6. Pinned view geometry

- **Cause:** the grid was centred at its natural width, three pins collapsed
  into three wide columns, and pin cards expanded to the viewport height.
- **Fix:** the grid fills the panel width; four homogeneous columns are kept
  even in a partially filled last row via invisible fillers; pin cards are
  exactly 236 px tall (outer card no vexpand, inner header/body fill it), with
  16 px gaps and 17 px radius. Header order is title → Back + Esc keycap →
  key hints → spacer → right hint. The stage remains mounted behind the scrim.
- **Evidence:** `ui/ClipboardWindow.tsx` `renderPins` + `pinsHead`;
  `ui/ItemCard.tsx` `PinCard`; `style.css` `.clipboard-pins-panel`,
  `.clipboard-pin-card`, `.clipboard-pin-body`; conformance test `the pinned
  view is an overlay over the stage with the mock geometry`. Manual/live
  screenshot confirms the inset, 4-column fill and 236 px rows.

### 7. Remaining visual checks

- Gear hover and pin squareness under the owner's active skin.
- Arrow movement with the live keyboard in Bottom and Left/Right (focus state
  verified; key injection tooling was unavailable in this lane).
- Pinned view Up/Down transition and focus wrap at 1600×1000 and 1280×800.
- Screenshot target:
  `tickets/REQ-009-clipboard-card-modes/screenshots/feedback-3/`.

## Feedback round 4 (2026-11-20)

Owner feedback: “image is always red, code is always black, etc”. The six
per-kind header plates made card chrome type-coloured instead of following the
active palette.

### A. Neutral card chrome

- **Before:** `.kind-text .clipboard-head` used `@tertiary`, code used
  `@surface_container_lowest`, image used `@error_container`, etc.
- **After:** one `.clipboard-head` rule uses `alpha(@surface_container, 0.75)`
  with `color: @on_surface` and a subtle `alpha(@on_surface, 0.08)` bottom
  hairline. The card body and header now both follow the active surface/ink
  roles. No hex.
- **Evidence:** `style.css` `.clipboard-head`; theme test `the card header is
  one neutral surface/ink plate`.

### B. Type identity is a dot

- **After:** `ItemHead` inserts a 6 px `.clipboard-type-dot` before the type
  label. It is the only type-coloured element in the header and reuses the
  header role map: Text `@tertiary`, Code `@surface_container_lowest`, Color
  `@error`, Image `@error_container`, Link `@primary`, Emoji `@secondary`.
- **Evidence:** `ui/ItemCard.tsx` dot construction; `style.css`
  `.clipboard-type-dot.kind-*`; theme test `type identity is only a small dot
  in the neutral header`.

### C. Shared selection/focus, neutral pin

- **After:** the six `.kind-*.selected` rules and six
  `.kind-*.clipboard-pin-card.focused` rules are gone. One
  `.clipboard-card.selected` and one `.clipboard-pin-card.focused` rule use
  `@primary` with a subtle tint/ring. The per-kind pin-button fills are gone;
  the 22×22 pin uses the neutral `@on_surface` control fill and still reads on
  the neutral header.
- **Evidence:** `style.css`; conformance test `fallback chrome has no
  hard-coded hex and uses one shared accent state`, plus `gear and pin controls
  are square and skin-derived`.

### D. Active skin caveat

- The app-side fallback is correct, but the currently composed
  `dotfiles-assets` skin still contains the old per-kind header/selection
  selectors and overrides the fallback at runtime. This lane does not edit
  `dotfiles-assets`.
- Verified the fallback directly with an isolated `XDG_STATE_HOME` (no
  composed appearance): all headers rendered neutral with only the type dot.
  Screenshot: `/tmp/req009-shots/r4-fallback.png`.
- The skin lane must delete the old per-kind selectors listed in the skin
  follow-up section above and paint `.clipboard-head`, `.clipboard-type-dot`,
  `.clipboard-card.selected` and `.clipboard-pin-card.focused`.

### Remaining visual checks

- After the skin template change: Image/Code/Text headers neutral under the
  active skin, type dots visible, one accent selection/focus ring, neutral pin.
- Screenshot target:
  `tickets/REQ-009-clipboard-card-modes/screenshots/feedback-4/`.

## Feedback round 5 (2026-11-20)

Owner rejected the neutral all-same header: the scheme already has six
semantic accent families, so cards should use them instead of `@error` /
`@error_container` / `@surface_container_lowest`.

### A. Header plates

- Six `.kind-* .clipboard-head` rules now use the exact accent mapping:
  - Text → `@primary` / `@on_primary`
  - Link → `@primary_container` / `@on_primary_container`
  - Code → `@secondary_container` / `@on_secondary_container`
  - Image → `@secondary` / `@on_secondary`
  - Color → `@tertiary` / `@on_tertiary`
  - Emoji → `@tertiary_container` / `@on_tertiary_container`
- `.clipboard-head` itself is structural only: height, padding and the bottom
  hairline. No neutral paint remains, and no type uses error/black roles.
- The 6 px type dot remains; it uses the matching `on_*` ink so it stays
  visible on the coloured plate.

### B. Selection / focus / pin

- Restored six `.kind-*.selected` rings and six
  `.kind-*.clipboard-pin-card.focused` rings using the same accent family,
  with subtle alpha fills and a soft outer halo.
- Restored six `.kind-* .clipboard-pin-button` fills using the matching `on_*`
  role; the base 22×22 square stays neutral for non-coloured surfaces.
- Filter dots use the header fill roles; header dots use the header ink roles.

### C. Tests

- `tests/theme-roles.test.mjs` asserts the six header fill/ink pairs, rejects
  `@error`, `@error_container` and `@surface_container_lowest` in every type
  identity rule, and checks dot mappings.
- `tests/app-contract.test.mjs` asserts per-kind selection/focus/pin fills,
  the six header families, no hex and no `min-width: 260px`.
- Evidence: `make test` 28 pass; `make conformance` 34 pass; full gates below.

### D. Skin caveat

- The app fallback is correct (verified with an isolated `XDG_STATE_HOME`, no
  composed skin). The active `dotfiles-assets` skin still carries the old
  per-kind roles and overrides the fallback until the skin lane updates the
  selectors listed in the skin follow-up section.

## Mock

Normative mock: [`mock.html`](./mock.html). Open it directly:

```sh
xdg-open tickets/REQ-009-clipboard-card-modes/mock.html
# or
google-chrome-stable --new-window "file://$PWD/tickets/REQ-009-clipboard-card-modes/mock.html"
```

Review deep links (append to the file URL):

```text
?mode=full      ?mode=compact
?card=code      ?card=5
?pins=1         ?settings=1
?compact_size=small|medium|large
?compact_align=bottom|left|right
?compact_view=recent|pinned
?empty=1        ?closed=1
```

The final compact extension adds the alignment and view links above.

State/DOM harness (Node only; also `node --check`s the inline script and drives
the compact layouts through headless Chrome when available):

```sh
node tickets/REQ-009-clipboard-card-modes/harness.mjs
```

Try `←`/`→`, `↑`/`↓`, `Enter`, `Ctrl+1..9`, `Ctrl+F`, `Delete`/`Ctrl+Z`, `/`,
`N` (simulate capture) and the gear. In the pinned grid, `←`/`→` move the focused
pin, `Enter` copies it and collapses the overlay, and `↓`/`Esc`/Back return. In
compact, `Tab`/`Shift+Tab` switch Recent/Pinned (Bottom also `↑`/`↓`; vertical
also `←`/`→` when search is not focused), and link cards expose a visible
`Open`. The faux editor behind the overlay makes the compact strip's
non-takeover behaviour visible.

The mock is the first source of truth for look and interaction. This ticket is
the source of truth for intent and acceptance. The design is frozen at commit
`6242101` (`mock.sha256`); the accepted compact extension is part of the intent,
and there is no pending proposal.
