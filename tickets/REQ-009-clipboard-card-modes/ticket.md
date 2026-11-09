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
- **Compact**: today's bottom-anchored, full-width card strip with the 260 px
  cards. Search, type filter, incognito, clear and settings stay in the strip's
  top row; the desktop above remains visible and sharp.
- Both modes preserve every current capability: all six kinds, copy-back,
  pin/unpin, delete with undo, clear with confirm, incognito, live updates
  without stealing selection, link open, honest empty states and `Ctrl+1..9`.

REQ-005's rail + preview is frozen on `main` and is **not** modified by this
ticket. REQ-009 replaces its interaction model; REQ-005 remains the historical
record. The live app keeps the current card strip until REQ-009 is implemented.

## Frozen baseline (approved 2026-11-09)

This is the approved card-stage iteration and the **intent** for the feature:

- Commit: `d9ed130` (card stage + pinned copy/collapse + compact bottom strip).
- Mock sha256: `06820b4b54e5ddfc83f367d9a2b7de0015201a6a6b2da971ea01006e6bd05037`
  (recorded in `mock.sha256`).
- The mock and this ticket are the baseline; any later mock additions are a
  proposal until this section is updated to the new commit/hash.

## Proposal (pending green)

This proposal extends the frozen baseline; it is **not intent yet**. The working
mock carries it for review, and `mock.sha256` stays at the baseline hash
`06820b4…` until the proposal is green-lit. The frozen section above is
unchanged. The proposal adds two compact-mode refinements.

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

### Proposal acceptance (unchecked until green)

- [ ] Settings shows `Compact alignment: Bottom / Left / Right`; card-size and
      alignment rows are disabled in Full and enabled in Compact.
- [ ] Bottom/Left/Right apply live, persist through the extended settings shape,
      and preserve mode, query, filter and selection.
- [ ] Left/Right render a full-work-area vertical column with 12 px inset and
      width derived from the card size; controls adapt; up/down (keys and
      affordances) navigate; left/right stay for Bottom.
- [ ] Compact shows a `Recent | Pinned (n)` view switch at the carousel header
      in every alignment; the active view replaces the card list and both views
      use the same card identity and size with no height/width jump.
- [ ] Recent excludes pinned cards; Pinned shows only pinned cards; zero pins
      hides/disables Pinned and keeps Recent.
- [ ] Search and filters apply to the active view and survive view switches;
      `Ctrl+1..9` addresses the active view; filtered-empty states are honest.
- [ ] Pinned carousel cards use the same select / `Enter` / double-click copy
      behaviour as Recent; the full pinned grid keeps copy-and-collapse.
- [ ] `?compact_view=recent|pinned`, `?compact_align=bottom|left|right` and all
      existing deep links work; the view is not persisted.
- [ ] Proposal accepted, then the baseline section and `mock.sha256` are updated
      together. No merge/freeze before that.

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
  { "layout": { "mode": "full", "compact": { "card_size": "medium" } } }
  ```

  Defaults are `full` / `medium`. Unknown values degrade to the defaults. The
  implementation uses the capture-tool pattern: pure domain + port + GLib
  adapter, save-on-change. This is **not** the daemon's
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
      search, filter, incognito, clear, pin/delete and live updates.
- [x] Settings apply live and persist through the documented
      `clipboard-ui/config.json` shape (mock: `localStorage`).
- [x] All documented deep links work: `?mode=full|compact`, `?card=<kind|n>`,
      `?pins=1`, `?settings=1`, `?compact_size=small|medium|large`, `?empty=1`,
      `?closed=1`.
- [x] A DOM/state harness and `node --check` pass for the mock, including the
      pinned-grid focus, wrap, copy+collapse, back, stage-isolation, click,
      empty and single-pin cases.
- [x] Baseline design approved and frozen: commit `d9ed130`, sha256
      `06820b4b54e5ddfc83f367d9a2b7de0015201a6a6b2da971ea01006e6bd05037`.
      The compact alignment + carousel view proposal is pending review.
- [ ] Implementation in the app: full stage, compact strip, settings adapter,
      persistence, all preserved behaviours.
- [ ] `make ci` / `make gates` pass; the composition pin is bumped.

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
?empty=1        ?closed=1
```

Pending proposal adds `?compact_align=bottom|left|right` and
`?compact_view=recent|pinned` (for review only until green-lit).

State/DOM harness (Node only; also `node --check`s the inline script and drives
the compact layouts through headless Chrome when available):

```sh
node tickets/REQ-009-clipboard-card-modes/harness.mjs
```

Try `←`/`→`, `↑`/`↓`, `Enter`, `Ctrl+1..9`, `Ctrl+F`, `Delete`/`Ctrl+Z`, `/`,
`N` (simulate capture) and the gear. In the pinned grid, `←`/`→` move the focused
pin, `Enter` copies it and collapses the overlay, and `↓`/`Esc`/Back return. The
faux editor behind the overlay makes the compact strip's non-takeover behaviour
visible.

The mock is the first source of truth for look and interaction. This ticket is
the source of truth for intent and acceptance. The baseline is frozen at commit
`d9ed130` (`mock.sha256`); the working mock may carry a pending proposal. The
proposal only becomes intent when its section is accepted and the baseline hash
is updated.
