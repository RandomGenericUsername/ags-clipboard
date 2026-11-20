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
| `make test` | exit 0 — 27 tests pass (settings domain/port, deck/view/selection/pinned-focus, appearance order, request dispatch) |
| `CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts make conformance` | exit 0 — 17 tests pass (manifest identity, settings path, save-on-change, compact Open chip/view keys, template gate, refresh invariants) |
| `CONTRACTS_ROOT=... make drift` | exit 0 — "all checks passed" against contracts v0.12.0 |
| `make typecheck` | exit 0 — `OK: 0 errors in the ags-clipboard tree` (27 tolerated `/usr/share/ags/js` errors, 0 platform) |
| `make bundle` | exit 0 — `build/ags-clipboard.js` (1,224,816 bytes) |
| `CONTRACTS_ROOT=... make gates` | exit 0 — all of the above (27 unit + 17 conformance, drift "all checks passed", bundle 1,224,816 bytes, 0 type errors) |

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

### Skin follow-up (shared paint pass, not this lane)

Roles/selectors that need skin paint in
`dotfiles-assets/skins/templates/ags-clipboard.gtk.css.j2`:

```text
.clipboard-root.clipboard-mode-full
.clipboard-stage-card, .clipboard-stage-body
.clipboard-peek, .clipboard-peek-card, .clipboard-peek-body
.clipboard-nav-arrow, .clipboard-control-bar, .clipboard-bar-button
.clipboard-pins-pill, .clipboard-gear, .clipboard-pin-card.focused
.clipboard-compact, .clipboard-compact.align-left, .clipboard-compact.align-right
.clipboard-search-box, .clipboard-chip.selected, .clipboard-view-tab.active
.clipboard-open-chip, .clipboard-strip-arrow, .clipboard-new-badge
.clipboard-settings, .clipboard-segment-button.selected
```

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
