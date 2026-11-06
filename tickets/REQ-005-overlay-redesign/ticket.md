---
id: REQ-005
title: "Redesign the clipboard as a two-mode command surface"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-005/
branch: ticket/REQ-005-overlay-redesign
---

# Redesign the clipboard as a two-mode command surface

## Requirement

Replace the bottom horizontal card strip with a desktop command surface:

- **Normal:** a top command bar, a history rail and a large item preview; a
  row click previews, `Enter`/Copy commits.
- **Compact:** a 440 px centre panel or a 400 px full-height left/right bar;
  search, filter, list, footer, no preview; a row click copies.
- The layout mode and compact position are persisted through the capture-tool
  settings pattern at `$XDG_CONFIG_HOME/clipboard-ui/config.json`.
- Pin, delete (with undo), clear (with confirm), incognito, live updates
  without stealing selection, and `Ctrl+1..9` are preserved.

The normative mock is [`mock.html`](./mock.html); this ticket is the app-local
implementation contract. The batch-level record is
`dotfiles-v3/docs/107-clipboard-overlay.md`.

## Acceptance

- [ ] The overlay implements the contract in this ticket.
- [ ] Normal and Compact (center/left/right) match the mock at 1600×1000 and
      1920×1080.
- [ ] `layout.mode` and `layout.compact.position` persist at
      `$XDG_CONFIG_HOME/clipboard-ui/config.json` and degrade safely.
- [ ] `make ci` and `make gates` pass; the composition pin is bumped.

## Mock (normative)

Open `mock.html` directly; no build step:

```sh
xdg-open tickets/REQ-005-overlay-redesign/mock.html
```

Try: `↑`/`↓`, `Enter`, `Ctrl+1..9`, `Ctrl+F`, `Delete`/Undo, `Esc`, `/`, `N`;
the gear → Layout (Normal/Compact) and Compact position (Center/Left/Right).
Deep links: `?mode=compact&pos=left`, `?mode=compact&pos=right`,
`?mode=compact&settings=1`, `?view=clear`, `?new=1`, `?closed=1`.

The mock is the first source of truth for look and interaction; this ticket is
the source of truth for invariants, settings, architecture and acceptance.

## Design contract

## 0.1 Inherited visual contract (restated)

1. Content is the surface; chrome floats.
2. One chrome layer: glass + 1 px hairline + one soft shadow. No accent frame.
3. Accent is a state colour (copy/selection/focus/progress); live is green;
   type hues annotate only.
4. Type scale ~10.5 / 11.5 / 13 / 15–16 / 21–30; sentence case; no uppercase
   micro-labels.
5. 8 px rhythm; radii: bar 16–18, card 13–14, chip 8–10, pill 999.
6. 40–44 px targets; every pointer action has a keyboard equivalent.
7. Browse is free; commit is explicit. (Compact mode's row click is its
   explicit retrieve action, C15; Normal keeps select = preview.)
8. Motion is widget-level (GTK 4.24 treats CSS transitions as dead); use
   crossfades/reveals, 160–280 ms.
9. Settings use the capture-tool grammar; this overlay persists
   `layout.mode` and `layout.compact.position`.

Core tokens: ink `#f6f5f8`, dim 62 %, faint 40 %; hairline
`rgba(255,255,255,.12)`; glass `rgba(9,9,13,.55)`; live `#4ade80`; accent from
the generated palette; on-accent from the palette.

---

## 0. Scope

**In scope**

- The clipboard overlay: command bar, history rail, item preview.
- Two layouts: **Normal** (full command surface) and **Compact** (a 440 px
  centre panel, or a 400 px full-height left/right bar), selected in settings.
- Selection/preview vs copy-back (commit), pinning, deletion, clear, incognito.
- Live clipboard updates and the no-steal-selection rule.
- The app-repo architecture needed to ship it.

**Out of scope**

- The daemon/history writer and the event contract (unchanged).
- Cross-app UI orchestration (see 106 §7.7 / D12).
- Appearance token changes. The app keeps the v2 appearance adapter.
- Normal-mode placement settings. The overlay persists `layout.mode` and the
  compact position; the normal command bar stays top, the desktop bar stays
  visible. If normal placement becomes configurable it joins the same file and
  106's placement math.
- Multi-monitor placement; see 106 §10.1.

---

## 1. Today (the thing being replaced)

The current `ags-clipboard` overlay is a bottom-anchored, full-width strip:

- a horizontal `Gtk.Box` of 260 px cards, one per item
  (`ui/ClipboardWindow.tsx:117-131`; `style.css:70`);
- each card has a **full coloured header bar** per type, with an index badge,
  glyph, label and relative time (`ui/ItemCard.tsx:120-170`;
  `style.css:124-180`);
- copy on click/Enter; `←`/`→` navigate; `Delete` removes; `Ctrl+F` pins;
  `Ctrl+1..9` copies by position (`ui/ClipboardWindow.tsx:233-280`);
- search + incognito + clear in a top row; incognito is driven by the daemon
  job through the event hub (`ClipboardWindow.tsx:299-312`);
- per-type palette roles drive the header ink via luminance math
  (`ui/ItemCard.tsx:84-147`);
- appearance via `createAppearance({ configDir: "ags-clipboard" })`
  (`app.tsx:19-26`);
- one window per monitor, anchored bottom (`app.tsx:70-76`).

Why it reads old:

1. the coloured header bar dominates the content; the type is louder than the
   thing you copied;
2. the horizontal strip is a carousel of equal-weight cards — bad for scanning
   long text and bad at scale;
3. there is no preview: an image is a 236×118 crop, code is five lines of a
   label, a link is a truncated line;
4. every card repeats chrome (header + border + radius);
5. per-type hue math in the app is a workaround the appearance plane should
   own (explicit ink tokens), not app-side luminance.

What must survive:

- search; type kinds (`text`, `image`, `link`, `code`, `color`, `emoji`);
- copy-back with the right representation (text/PNG);
- pin/favourite, delete, clear;
- `Ctrl+1..9`;
- incognito pause/resume through the daemon job;
- link open on right-click;
- live `clipboard.update` / `clipboard.state`;
- the `show`/`hide`/`toggle` request surface and instance name `clipboard`;
- appearance v2 refresh preserving query/selection/visibility.

---

## 2. Locked decisions

| ID | Decision | Why | Consequence |
| --- | --- | --- | --- |
| **C1** | The overlay is a **full-monitor command surface**, not a bottom card strip. A dimmed, blurred desktop sits behind it; the content owns the screen. | Clipboard is a focus task; the old strip made every item equal and hid the content. | Full-screen window; a command bar at the top; two content columns below. |
| **C2** | Two-pane layout: **history rail (left) + item preview (right)**. The preview is the surface; the rail is the index. | Text, code, images and links need room. A preview is the missing feature. | Rail 420 px; preview flexible; one selection drives both. |
| **C3** | One **command bar** at the top, below the desktop bar: search, type filters, incognito, clear. | Everything global lives in one place; the content stays clean. | The bar respects the desktop bar's reserved strip; no second settings bar. |
| **C4** | **Browse ≠ commit.** Selecting a row previews it. `Enter` / **Copy** puts it on the clipboard. `Ctrl+1..9` is the direct-copy power path. | The old click-to-copy had no preview; the new model makes reading free and copying explicit. | `copyItem` is only called from the commit actions. |
| **C5** | Type is a **3 px stripe + glyph tint**, not a full coloured header. | The type should annotate the content, not outshine it. | Palette roles still tint the type; no luminance math in the app. |
| **C6** | **Pinned items group first**, then Today / Yesterday / Older. Pin/unpin from the row or the preview footer. | Pins are the user's deliberate shortlist; they should not scroll away. | A pinned toggle; section headers; selection survives the move. |
| **C7** | **Delete is undoable** (toast with Undo); **Clear requires an inline confirm**. | Destructive actions need a way back; clear also deletes cached images. | Delete removes + toast; Clear turns the button into `Clear all? Yes / No`. |
| **C8** | **Incognito is a visible state**, not a hidden mode: a pill in the command bar and a “captures paused” note in the rail. | Pausing capture is important; the user must see it. | Driven by `clipboard.state`; tinted active state; no config file. |
| **C9** | **Live updates never steal the selection.** New items appear at the top; if the user is elsewhere, a `N new` pill appears. | The old overlay jumped the selection to the newest item mid-browse. | A `new` marker + a jump-to-top pill; selection preserved. |
| **C10** | Copy success **closes the overlay immediately**; copy failure keeps it open with an error. Opening a link closes and hands off to `xdg-open`. | Speed is the point of a clipboard; a failure must not look like success. | `copyItem().then(hide).catch(keep open)`. |
| **C11** | Normal-mode placement is fixed: the desktop bar stays visible (reserved strip respected), the command bar top. The **layout mode** and **compact position** are configurable. | Avoid normal-placement keys before the orchestrator defines the cross-app grammar; the compact mode genuinely needs its mode and side. | If normal placement becomes configurable, reuse 106's placement settings and the same `config.json`. |
| **C12** | **Virtualize the rail** (`Gtk.ListView` + model) or otherwise keep map/show off the card-build path. | The measured full-history card build is ~430 ms; a richer preview list must not regress it. | Model-driven rows; async image decode; search filters the model, not a widget rebuild. |
| **C13** | Appearance v2 stays the one provider; the preview/list state survives a refresh. | Live palette changes must not reset the user's place. | Rebuild type tints/icons; preserve query, filter, selection, incognito, scroll. |
| **C14** | Inherit 106's visual rules: one chrome layer, accent for state, 8 px rhythm, 40–44 px targets, sentence case, no uppercase micro-labels. | The batch must feel like one system. | New CSS; no coloured header bars; no accent frames. |
| **C15** | Two layouts: **Normal** (full command surface, default) and **Compact**. Compact is a **440 px centre panel** or a **400 px full-height left/right bar**, with search, filter, list and footer; no preview. Normal previews; compact retrieves. | The full surface is great for reading and judging; a clipboard is often a quick grab, and the side of the screen is valuable real estate. | Mode + compact position are settings; data, filters, selection and actions are shared. Compact row click = copy; normal row click = preview. |
| **C16** | The layout mode and compact position are persisted in an app-owned JSON file using the capture-tool settings pattern. | One settings grammar across apps; the choice must survive restart. | `$XDG_CONFIG_HOME/clipboard-ui/config.json`, pure domain + port + GLib adapter, save-on-change. |

### 2.1 Defaults

- Layout: **Normal**.
- Compact position: **Center**.
- Desktop bar visible (reserved top strip respected).
- Command bar top.
- Filter `All`.
- Selection = first item in the filtered list.

---

## 3. User flow and state machine

### 3.1 States

| State | What is on screen | Primary action |
| --- | --- | --- |
| `closed` | The desktop; no overlay | — |
| `browsing` | Command bar + rail + preview, selection focused | `Enter` copy |
| `searching` | Same, search focused, filtered list | `Enter` copy first/selected |
| `clear-confirm` | `Clear all? Yes / No` inline | Yes clears |
| `copied` | Overlay fading out + toast | — |
| `opening` | Overlay fading out + toast | — |
| `empty` | Empty rail + empty preview | — |
| `incognito` | Browsing with `Incognito on` + paused note | Toggle off |

Both layouts share these states. In `browsing`, Normal renders rail + preview;
Compact renders the compact list. Selection and filters are shared; the only
interaction difference is that **a compact row click commits** (copies), while
a normal row click previews (C15).

### 3.2 Transitions

| From | Event | To | Notes |
| --- | --- | --- | --- |
| `closed` | `show` / keybind | `browsing` | Hydrate history; reset filter All; select first; focus search. |
| `browsing` | `↑`/`↓` | `browsing` | Move selection; preview follows; scroll into view. |
| `browsing` | type | `searching` | Filter by text; selection moves to first match. |
| `browsing` | filter chip | `browsing` | Filter by kind; selection first match. |
| `browsing` | `Enter` / Copy | `copied` | `copyItem`; hide on success; error keeps `browsing`. |
| `browsing` | `Ctrl+1..9` | `copied` | Copy the nth filtered item. |
| `browsing` | `Ctrl+F` / pin | `browsing` | Toggle; regroup; keep selection. |
| `browsing` | `Delete` | `browsing` | Remove; select next; toast Undo (5 s). |
| `browsing` | Clear button | `clear-confirm` | Inline confirm in the command bar. |
| `clear-confirm` | Yes | `empty`/`browsing` | Clear history; toast. |
| `clear-confirm` | No / `Esc` | `browsing` | No write. |
| `browsing` | link + right-click / Open | `opening` | Hide; `openUrl`. |
| `browsing` | `Esc` | `closed` | Hide; no write. |
| `browsing` (Normal) | row click | `browsing` | Preview only; no copy. |
| `browsing` (Compact) | row click | `copied` | Retrieve-first: copy and close. |
| `browsing` (Compact) | expand icon | `browsing` (Normal) | Persist the mode; same selection. |
| `browsing` (either) | gear → Layout | `browsing` (other) | Persist; re-render; preserve query/filter/selection. |
| `browsing` (Compact) | gear → Compact position | `browsing` (same mode) | Persist; move the panel live; keep selection; popover follows the gear. |
| `browsing` | incognito pill | `incognito` | `control(job, pause/resume)`. |
| `incognito` | incognito pill | `browsing` | Resume. |
| any | `clipboard.update` | same state | Insert; show `N new` if not at top; never steal selection. |
| any | external hide (`ags toggle`) | hidden | Keep state; on remap re-hydrate and preserve query/filter where possible. |

### 3.3 Copy/open semantics

- `copyItem(item)` is the only clipboard write. It already handles image/png
  vs text. On success: hide the overlay, show a success toast.
- On failure: keep the overlay open, show the error in the command bar/status,
  keep the selection.
- Link open (`openUrl`) only on an explicit Open or right-click; hide only
  after the URL is valid.
- Image file missing: preview shows a broken-image state; Copy is disabled;
  the item can be deleted.

---

## 4. Layout specification

### 4.1 Anatomy

```text
┌──────────────────────────────────────────────────────────────┐
│  desktop bar (your normal bar; visible)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ⌕ Search clipboard…   All Text Links Code …  ⏸  Clear  │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────┐  ┌───────────────────────────────┐  │
│  │ History        12    │  │ Text             2 min ago    │  │
│  │ Pinned               │  │                               │  │
│  │  ▌ note…             │  │  The actual copied content    │  │
│  │  ▌ link…             │  │  gets the room it deserves.   │  │
│  │ Today                │  │                               │  │
│  │  ▌ text…             │  │                               │  │
│  │  ▌ code…             │  │  [Pin] [Delete]      [Copy ↵] │  │
│  └──────────────────────┘  └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Compact (440 px, top centre, sharp desktop behind):

```text
┌──────────────────────────────────────────┐
│ ⌕ Search…                  All ▾      ⚙  │
├──────────────────────────────────────────┤
│ Pinned                                   │
│ ▌ note…                          12m  ⚲  │
│ ▌ github.com                     28m  ⚲  │
│ ──────────────────────────────────────── │
│ ▌ Browse is free…                 1m     │
│ ▌ export function…                3m     │
│ ▌ screenshot…                     5m     │
│ …                                        │
├──────────────────────────────────────────┤
│ 12 items       Incognito off  Clear   ⤢  │
└──────────────────────────────────────────┘
```

### 4.2 Command bar

- Full content width, 60 px high, top 16 px below the reserved desktop strip;
  glass `rgba(9,9,13,.55)`, 1 px hairline, radius 16, 24 px blur.
- Search: icon + `Gtk.Entry`, flexible with a 380 px minimum; `/` keycap;
  placeholder `Search clipboard…`.
- Filters: `All`, `Text`, `Links`, `Code`, `Images`, `Colors`, `Emoji` as
  segmented chips, 28 px high, 11 px / 600. Each type chip carries a 6 px dot
  in its type hue. Selected = white 14 % fill (not the global accent).
- Incognito: pill with a pause glyph; `Incognito off` neutral, `Incognito on`
  in the global accent tint with a dot.
- Clear: quiet destructive text button (`trash` + `Clear`), red ink on hover.
  Clicking turns the right side into `Clear all? [Yes] [No]`; Yes is red.
- Gear: opens the Layout popover (Normal / Compact). No other global actions.

### 4.3 History rail

- 420 px wide (360–480 responsive), full content height, glass panel,
  radius 18, 1 px hairline, 24 px blur.
- Header: `History` 15 / 650, count pill, `N new` accent pill (only when the
  user is not at the top).
- Sections: `Pinned`, `Today`, `Yesterday`, `Older`; 10.5 / 600 faint;
  sticky within the scroll area.
- Row: 64 px high, 12 px horizontal padding, 3 px type stripe at the left,
  18 px glyph (or a 36×36 image thumbnail), title 13 / 600 one line,
  subtitle 11 / 500 dim (`Type · age`), 9.5 faint index for the first 9
  filtered items, pin glyph at the right (filled when pinned, outline on
  hover/selected).
- Selected: background `rgba(255,255,255,.07)`, type stripe at full opacity,
  title full ink. Hover: `rgba(255,255,255,.04)`.
- Empty: centered `Clipboard is empty` + hint; no fake rows.
- The rail scrolls independently; the command bar and preview stay put.

### 4.4 Preview

- Flexible width; no heavy panel. A very subtle tint
  `rgba(9,9,13,.30)` with radius 18; no border. The content is the surface.
- Header: type chip (glyph + label in the type hue) + relative time (+ line
  count for code); 11.5 dim. Size/dimensions live in the footer, not twice.
- Body (per kind):
  - **text**: 15 px / 1.7, max width 820, `white-space: pre-wrap`; scrolls.
  - **code**: 12.5 px monospace / 1.65 in an inset `rgba(255,255,255,.04)`
    block, radius 12, padding 18; line count in the header; horizontal scroll.
  - **image**: contain-fit preview, radius 14, max height ~420;
    dimensions in the header. A missing file shows a broken-image state.
  - **color**: 100 % × 220 px swatch, radius 16; hex 28 / 650 below;
    RGB/HSL 11.5 dim. Copy copies the hex.
  - **link**: globe badge, domain 18 / 650, full URL 12 / dim; an Open
    secondary action in the footer.
  - **emoji**: 120 px glyph centered; caption.
- Footer: hairline top, 14 px 24 px; left = size (and image dimensions) plus a
  10 px hint line (`↑↓ browse · ↵ copy · ⌫ delete · Ctrl+F pin`); right =
  `Pin`, `Delete` (destructive ghost), optional `Open`, and `Copy` (accent
  pill with `↵`).
- The footer is local to the item; it is not a second global bar.

### 4.5 Toasts

- Bottom centre, above the overlay edge; glass pill.
- `Copied · <title>` with a green dot; `Deleted · Undo` with an accent
  `Undo` text button (5 s); `History cleared`; `Opening <domain>…`;
  copy failure `Could not copy: <reason>` (error ink).
- The re-open pill after closing is a prototype affordance only; the real app
  is reopened by the keybind/launcher.

### 4.6 Type hues

Palette roles, not fixed app math (the v1 luminance workaround retires):

| Kind | Role (proposal) | Use |
| --- | --- | --- |
| text | tertiary | stripe, glyph, filter dot |
| code | secondary | stripe, glyph, filter dot |
| image | primary | stripe, glyph |
| color | error | stripe, glyph |
| link | primary/tertiary variant | stripe, glyph |
| emoji | secondary/tertiary variant | stripe, glyph |

The exact role mapping is settled against the appearance v2 palette at
implementation time; the rule is **role, not hex** and **annotate, not fill**.
No app-side luminance/contrast math.

### 4.7 Responsive safety

- `< 1200 px`: rail 360 px; filter chips scroll horizontally.
- `< 980 px`: rail 320 px; preview header metadata wraps.
- The target is a desktop monitor; no mobile layout.

### 4.8 Accessibility

- Rows are focusable; the selected row is announced; the preview is labelled
  by the type + title.
- All icon-only actions have accessible names.
- `Delete` is destructive but undoable; Clear has a confirm.
- No hover-only action is the only path: pin/delete also live in the preview
  footer; copy has `Enter`.
- Focus ring 2 px accent; 40–44 px targets.

### 4.9 Compact layout

- **Positions** (a persisted setting):
  - **Center:** 440 px wide, top `10vh`, centred, `max-height: 64vh`.
  - **Left bar:** 400 px wide, `left: 12px`, `top: 52px` (desktop bar 40 + 12
    gap), `bottom: 12px` — full work-area height.
  - **Right bar:** 400 px wide, `right: 12px`, same top/bottom — full work-area
    height.
  The side bars are intentionally inset 12 px (floating language), not
  edge-to-edge; the desktop bar stays visible above them.
- Glass `rgba(9,9,13,.74)` + 28 px blur, radius 18, strong shadow.
- The desktop stays **sharp** (`#wall` unblurred, full brightness) with a very
  light `rgba(0,0,0,.16)` dim; the panel floats. The normal mode keeps the
  blurred/dimmed desktop and the full scrim.
- Header (50 px): search field (flex), a compact type `<select>` (84 px max),
  a 30 px gear.
- List (48 px rows): 2 px type stripe, 26 px glyph or image thumb (or a
  14 px colour dot), title 12.5 / 600 one line, age 9.5 at the right, pin
  22 px on hover/selected. Pinned items first with a 9.5 px `Pinned` label and
  a 1 px divider; no other section labels. The side bars use the extra height
  for more rows; the header/footer stay pinned.
- Footer (36 px): `N items`, optional `N new`, spacer, `Incognito off/on`,
  `Clear`, expand-to-normal icon. In clear-confirm, the row becomes
  `Clear all? Yes / No`.
- No preview pane. The row is the item; the normal mode is the place to read.
- Empty: centred `Clipboard is empty` / `No matches` inside the list.
- The panel is a **content surface inside the same full-screen transparent
  window** (for outside-click/keyboard capture), not a separate dialog.
  Position changes only re-apply the panel's anchor/size; the window, model,
  selection and focus survive.

---

## 5. Interaction contract

### 5.1 Keyboard

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move the selection in the filtered list (works while search is focused) |
| `Enter` | Copy the selected item and close |
| `Ctrl+1..9` | Copy the nth filtered item and close |
| `Ctrl+F` | Toggle pin on the selected item |
| `Delete` | Delete the selected item; Undo toast |
| `Esc` | Close Layout popover, then Clear-confirm, then clear a non-empty search, then close the overlay |
| `/` | Focus the active search field (normal or compact) |
| `Tab` / `Shift+Tab` | Move focus between search, filters/select, rail/list, actions |
| Right-click on a link | Open the URL (existing behaviour) |

`Delete` is intercepted in the capture phase; the search entry uses
`Backspace` for text deletion. Document this in the UI hint.

### 5.2 Pointer

| Target | Action |
| --- | --- |
| Row (Normal) | Select + preview (does not copy) |
| Row (Compact) | Copy + close (retrieve-first) |
| Row pin glyph (both) | Toggle pin; does not copy |
| Filter chip (Normal) | Filter |
| Filter select (Compact) | Filter |
| Search | Filter |
| Incognito | Toggle pause/resume |
| Clear | Inline confirm |
| Copy (Normal) | Copy + close |
| Open (Normal, link) | Open link + close |
| Pin (Normal footer) | Toggle pin |
| Delete (Normal footer) | Delete + Undo toast |
| Gear (both) | Layout popover |
| Compact expand icon | Switch to Normal; persist |
| Row right-click (link) | Open URL |

### 5.3 Live updates

- `clipboard.update` inserts an item at the top.
- If the user's selection is the first item and the list is at the top, keep
  the new item selected? No: **never steal**. Keep the current selection; show
  a `1 new` pill. If the list was empty, select the new item.
- The pill counts arrivals since the user last was at the top; clicking it
  scrolls to the top and clears.
- A new row carries a subtle 2 s accent stripe/animation; it must not block.
- `onRestart` re-hydrates; preserve the query/filter/selection when the item
  still exists.

### 5.4 Incognito

- The pill reflects `clipboard.state` (`paused` + `job_id`).
- If `job_id` is absent, the pill is disabled with a tooltip (`Clipboard
  service unavailable`).
- Toggling sends `control(job, pause|resume)`; the UI waits for the state
  event, not an optimistic label.
- While paused, the command bar shows `Incognito on` and the rail header shows
  `Captures paused` in the accent; existing items remain browsable/copyable.

### 5.5 Clear

- Inline confirm, not a modal. `Clear all?` + `[Yes] [No]`.
- Yes clears the history and deletes cached images (existing
  `clearHistory`), then shows the empty state and a toast.
- No/Esc returns to browsing with the same selection.
- Because clear deletes image files, there is no Undo for Clear; the confirm
  is the safety.

### 5.6 Empty and error states

- Empty history: rail `Clipboard is empty`; preview `Copy something and it
  will appear here.`; Copy disabled; search still available.
- No matches: rail `No matches for “…”`; preview empty; `Esc` clears.
- Copy failure: overlay stays open; error in the command bar/status; selection
  unchanged; Copy re-enabled.
- Image missing: broken-image placeholder in the preview; Copy disabled;
  Delete available.
- Incognito unavailable: disabled pill with tooltip.

### 5.7 Layout mode settings

- **File:** `$XDG_CONFIG_HOME/clipboard-ui/config.json`

  `$XDG_CONFIG_HOME/clipboard/config.json` is the **daemon's** file and must
  never be written by the UI. `$XDG_CONFIG_HOME/ags-clipboard` is the AGS
  config link into the installed tag (immutable); the UI writes only its own
  `clipboard-ui` namespace.
- **Schema:**

  ```json
  {
    "layout": {
      "mode": "normal",
      "compact": { "position": "center" }
    }
  }
  ```

  `mode`: `"normal" | "compact"`; anything else → `"normal"`.
  `layout.compact.position`: `"center" | "left" | "right"`; anything else →
  `"center"`. Unknown keys are ignored. Missing keys fall back per-key. The
  file is pretty JSON with a trailing newline.
- **Defaults:** `mode = normal`, `compact.position = center`.
- **Pattern:** the capture-tool four layers — pure `domain/settings.ts`,
  `ports/settings-store.ts`, `adapters/glib-settings-store.ts`, and a settings
  UI built from the same row grammar (segmented pills, save-on-change).
  Missing file → silent defaults; corrupt → loud log + defaults; save failure
  keeps the in-memory value and shows the error.
- **UI:** a gear in the normal command bar and in the compact header. The
  popover has **Layout: Normal / Compact** and **Compact position: Center /
  Left / Right** (the position row is disabled unless Layout is Compact, the
  same sensitivity rule as the capture tool's Top offset), plus
  `Changes save immediately.` The compact footer also has an expand-to-normal
  icon; all paths write the same keys.
- **Apply:** the mode and position change live, preserving query, filter,
  selected item and scroll where possible; focus moves to the active search.
  The position change moves the panel without recreating the window; the
  settings popover follows the gear. No restart.
- **Placement is not a setting here** (C11). If it becomes one, it joins this
  file and the 106 placement math; the orchestrator later resolves cross-app
  conflicts.
- The mock persists the same shape in `localStorage`; the real app writes the
  JSON file above.

---

## 6. Architecture

### 6.1 Repo and identity

`ags-clipboard` is standalone:

```text
app=clipboard  instance=clipboard  configDir=ags-clipboard  mode=live
window=clipboard-window
```

The request surface (`show`/`hide`/`toggle` + `palette-refresh`) is unchanged.
The launcher toggles the window; the instance name stays `clipboard`.

### 6.2 New/changed modules

```text
domain/settings.ts          ClipboardSettings, defaults, merge, validate
ports/settings-store.ts     load()/save()
adapters/glib-settings-store.ts   $XDG_CONFIG_HOME/clipboard-ui/config.json
ui/OverlayWindow.tsx        full-screen transparent host window
ui/CommandBar.tsx           search, filters, incognito, clear, settings gear
ui/HistoryRail.tsx          Gtk.ListView + model + sections (Normal)
ui/PreviewPane.tsx          per-kind preview + footer actions (Normal)
ui/CompactPanel.tsx         440 px quick panel (Compact)
ui/SettingsPopover.tsx      Layout: Normal / Compact
lib/preview-model.ts        pure: filters, grouping, selection, title/domain
lib/type-roles.ts           palette role per kind (no luminance math)
style.css                   rewritten around the new classes
```

Reuse: `lib/history.ts` (`copyItem`, `deleteItem`, `clearHistory`,
`toggleFavorite`, `openUrl`), `lib/clipboard-types.ts`, `lib/requests.ts`,
`app.tsx` request handler, the appearance adapter.

### 6.3 Rendering and performance

- One `Astal.Window` per focused monitor (same multi-monitor question as 106
  §10.1); `layer = OVERLAY`, anchor all edges, `exclusivity = IGNORE`,
  `keymode = ON_DEMAND`, `margin_top = reservedTop` (desktop bar visible).
  The window stays full-screen and transparent in **both** modes so outside
  clicks and the key controller work; only the drawn content changes.
- **Normal:** dimmed/blurred desktop, command bar + rail + preview.
- **Compact:** sharp desktop (or a very light dim); a 440 px centre panel or a
  400 px full-height left/right bar; the command bar/rail/preview are hidden.
  The panel is a child of the same window, not a second dialog. The side bars
  sit below the desktop bar (top 52 px) with a 12 px inset.
- Mode/position switch: hide/show the content trees, re-apply the
  wallpaper/scrim treatment and the panel anchor/size, preserve
  query/filter/selection/scroll, and focus the active search. No window
  recreate, no process restart.
- Command bar: `Gtk.Box`/`Gtk.CenterBox` in a glass container.
- Rail: `Gtk.ListView` with a `Gio.ListStore` (or a `Gtk.FilterListModel` +
  `Gtk.SortListModel`) so 140+ items do not build 140 widget trees. Sections
  are either a `Gtk.ListView` with section headers or a `Gtk.ColumnView` with
  a header factory; pick one and keep it virtualized. The compact list uses the
  same model/filter; only the row factory differs.
- Preview: rebuild only on selection change, not on every update.
- Images: decode the rail thumb at 36×36, the compact thumb at 26×26, and the
  preview at display size asynchronously; cache by path+mtime. Never block
  map/show.
- Search: filter the model; 150 ms debounce; no widget rebuild.
- Selection: preserve across live updates, pin moves and mode switches; scroll
  into view.
- Appearance refresh: re-tint glyphs/stripes and rebuild cached textures;
  preserve query/filter/selection/incognito/scroll.
- Copy/open: use the existing functions; no new writes.

### 6.4 Tests and gates

Current tests: `tests/unit.test.mjs`, `tests/theme-roles.test.mjs`,
`tests/app-contract.test.mjs`, `tests/event-contract-drift.mjs`.

Add/rewrite:

- `preview-model.test.mjs`: filter by kind + query; grouping; selection
  preservation; title/domain extraction; index mapping for Ctrl+1..9.
- `settings.test.mjs`: defaults, `layout.mode` merge/validation, corrupt input,
  unknown keys.
- `mode-flow.test.mjs`: normal row click does **not** copy; compact row click
  does; switching mode preserves query/filter/selection; the compact expand
  and the gear both write the same key.
- `type-roles.test.mjs`: role mapping, no hex/luminance math in the app.
- `copy-flow.test.mjs`: browse never calls `copyItem`; Enter/Copy do; success
  hides; failure keeps the overlay; link open only on explicit Open.
- `update-no-steal.test.mjs`: a live update does not change the selection;
  the new pill counts.
- Keep `theme-roles` but replace the header-contrast assertions with the
  stripe/glyph role assertions (the v1 workaround is retired).

Commands: `make ci`, `make gates` in `ags-clipboard`; then the composition’s
`make gates-ci` + `make deploy-coverage` after the tag bump.

### 6.5 Shipping shape

- One new tag for `ags-clipboard`; composition bumps `apps.yaml`.
- No new skeleton files; no engine registration.
- Rollback = previous tag. The history file format is unchanged, so the old
  overlay can read the same data.

---

## 7. Acceptance criteria

**Visual**

- [ ] The overlay reads as one command surface: one command bar, a rail, a
      preview; no coloured header bars, no accent frames.
- [ ] Type is a 3 px stripe + glyph tint; the content dominates.
- [ ] The selected row, the preview header/footer, and the empty/no-match
      states match the mock at 1600×1000 and 1920×1080.
- [ ] Pin, delete, clear-confirm, incognito-on and copied states are distinct.
- [ ] Compact mode is a 440 px centre panel or a 400 px full-height left/right
      bar on a sharp desktop; the full surface is hidden; the panel does not
      read as a dialog/card.
- [ ] Compact rows are 48 px with a stripe, glyph/thumb, title, age and pin;
      the footer has count, incognito, clear and expand.
- [ ] Switching Normal ↔ Compact or Center/Left/Right preserves query, filter,
      selection and does not restart the app; the side bars span the work-area
      height below the desktop bar.

**Interaction**

- [ ] In **Normal**, clicking/focusing a row only previews; Enter/Copy is the
      only copy path (besides `Ctrl+1..9`).
- [ ] In **Compact**, clicking a row copies and closes; the pin glyph toggles
      without copying; Enter copies the keyboard selection.
- [ ] `↑`/`↓` work while search is focused; Enter copies; Esc clears search
      then closes.
- [ ] Delete is undoable; Clear requires the inline confirm.
- [ ] A live update never steals the selection; `N new` appears in both modes.
- [ ] Incognito reflects the daemon state, not an optimistic label.
- [ ] Copy success closes; failure keeps the overlay with an error.
- [ ] Every pointer action has a keyboard equivalent.

**Settings**

- [ ] `$XDG_CONFIG_HOME/clipboard-ui/config.json` persists `layout.mode` and
      `layout.compact.position`; missing/corrupt degrades to
      `normal`/`center`; the overlay still opens.
- [ ] The gear in both modes opens the same Layout popover; the Compact
      position row is disabled unless Layout is Compact; changes apply live
      and survive a restart.
- [ ] The compact expand icon and the gear write the same mode key.

**Performance**

- [ ] Opening with 140+ items does not build 140 widget trees on the map path;
      the overlay presents immediately.
- [ ] Search/filter updates the model, not the widget tree.
- [ ] Image previews decode asynchronously; no jank on selection.
- [ ] The preview updates on selection change only.

**Architecture**

- [ ] The request surface and instance name are unchanged.
- [ ] History format unchanged; copy/delete/clear/pin use the existing
      functions.
- [ ] Appearance refresh preserves query/filter/selection/incognito/scroll.
- [ ] `make ci` + `make gates` pass; the composition gates pass after the tag
      bump.

---

## 8. Open questions

1. **Placement.** This design keeps the desktop bar visible, the command bar at
   the top, and the compact panel top-centre. Should placement later join the
   same settings file as 106's `control_bar` / `desktop_bar` keys? (Recommend:
   only if it proves useful; the orchestrator will own cross-app conflicts.)
2. **Compact size/position.** Positions are decided: centre 440 px, left/right
   400 px full work-area height, 12 px inset below the desktop bar. Still open:
   should the width be adjustable, and should the side bars be edge-to-edge
   instead of inset?
3. **Compact click model.** Compact uses click = copy (retrieve-first); normal
   uses select = preview. Is that the right speed/safety trade, or should
   compact also require Enter?
4. **Compact preview.** No preview pane. Should `Space` (or a long-press) show
   an inline preview for long text/images without leaving compact?
5. **Default layout.** `normal` is the default. Should heavy users be able to
   make compact the default (the setting already allows it), or should the
   first run choose based on history size?
6. **Multi-monitor.** Same as 106 §10.1; currently one window per monitor,
   bottom-anchored. Decide focused-monitor vs primary.
7. **Virtualized rail.** `Gtk.ListView` vs `Gtk.ColumnView` with sections;
   pick the one that gives sticky section headers and cheap updates.
8. **Type-role map.** Final palette roles for text/code/image/color/link/
   emoji against the v2 appearance tokens; no luminance math.
9. **Clear undo.** Clear deletes cached images; if the runtime can defer
   deletion, an Undo could be added later.
10. **Pinned ordering.** Pinned items first by recency vs manual order; this
    design uses recency. Manual reorder is out of scope.

---

## 9. Evidence index

Current app:

- `ags-clipboard/app.tsx:19-26` — `createAppearance`.
- `ags-clipboard/app.tsx:70-76` — one window per monitor, bottom anchor.
- `ags-clipboard/ui/ClipboardWindow.tsx:117-131` — horizontal 260 px cards.
- `ags-clipboard/ui/ClipboardWindow.tsx:233-280` — keyboard copy/delete/pin.
- `ags-clipboard/ui/ClipboardWindow.tsx:299-312` — incognito via event hub.
- `ags-clipboard/ui/ItemCard.tsx:84-147` — palette luminance header math.
- `ags-clipboard/ui/ItemCard.tsx:120-170` — coloured header bar.
- `ags-clipboard/ui/Preview.tsx` — 236×118 image, colour swatch, text lines.
- `ags-clipboard/style.css:11-17,70,124-180` — panel/card/header styling.
- `ags-clipboard/lib/history.ts` — copy/delete/clear/pin/open.
- `ags-clipboard/lib/clipboard-types.ts` — item model, kinds, search.

Design rules inherited from:

- `dotfiles-v3/docs/106-wallpaper-selector-overlay.md` §3 (principles) and
  §5.7 (tokens).

Settings pattern reference (the clipboard's `layout.mode` file mirrors it):

- `ags-capture-tool/domain/settings.ts` — pure defaults/merge/validate.
- `ags-capture-tool/ports/settings-store.ts` — `load()` / `save()` seam.
- `ags-capture-tool/adapters/glib-settings-store.ts:31-32,45-70,76-95` — file
  path, degradation, write.
- `ags-capture-tool/ui/shared/rows.ts:110-205` — toggle/pill/number rows.
- `ags-capture-tool/ui/classic/SettingsPage.tsx:95-110` — save-on-change.
