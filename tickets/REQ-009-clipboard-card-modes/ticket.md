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
  `↓` or `Esc` returns to the stage. `Enter` copies; `Ctrl+F` pins/unpins;
  `Delete` deletes with undo; `Ctrl+Z` undoes; `Esc` closes the overlay.
- Bottom control bar: `n / total`, current type and time, `Copy`, `Pin`/`Unpin`,
  `Delete`, `Open` (links only), and the hints `← → cards · ↑ pinned · ↓ back`.
- Pinned grid: a full-window 4-column grid of smaller current-style cards,
  headed `Pinned · n`. Clicking a pinned card focuses it in the stage and
  returns. An empty grid says so honestly.

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
- [x] Pinned grid opens with `↑`/the pill, returns with `↓`/`Esc`/Back, and a
      card click focuses it in the stage.
- [x] Compact mode keeps the current card identity at 220/260/300 px, with
      search, filter, incognito, clear, pin/delete and live updates.
- [x] Settings apply live and persist through the documented
      `clipboard-ui/config.json` shape (mock: `localStorage`).
- [x] All documented deep links work: `?mode=full|compact`, `?card=<kind|n>`,
      `?pins=1`, `?settings=1`, `?compact_size=small|medium|large`, `?empty=1`,
      `?closed=1`.
- [x] A DOM/state harness and `node --check` pass for the mock.
- [ ] Design review green light, then freeze this ticket's contract and the
      mock's sha256 in the same commit.
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

State/DOM harness (Node only; also `node --check`s the inline script):

```sh
node tickets/REQ-009-clipboard-card-modes/harness.mjs
```

Try `←`/`→`, `↑`/`↓`, `Enter`, `Ctrl+1..9`, `Ctrl+F`, `Delete`/`Ctrl+Z`, `/`,
`N` (simulate capture) and the gear. The faux editor behind the overlay makes the
compact strip's non-takeover behaviour visible.

The mock is the first source of truth for look and interaction. This ticket is
the source of truth for intent and acceptance. The full contract and hash are
frozen only after the design review; until then this is a design deliverable,
not an implementation claim.
