import { Astal, Gdk, Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
// The one domain-event client (spine AD-5): the app consumes the platform's
// shared client instead of a local event-bus copy. Topics are the contract
// names, passed as literals exactly as the bar does for `capture.state`.
import { domainEvents, type DomainPayload } from "ags-platform/adapters/event-bus"
import {
  itemFromPayload,
  itemKey,
  matchesQuery,
  type ClipboardItem,
  type ClipboardUpdatePayload,
} from "../lib/clipboard-types"
import {
  clearHistory,
  copyItem,
  deleteItem,
  firstUrl,
  openUrl,
  readHistory,
  toggleFavorite,
} from "../lib/history"
import { applyAppearance, type AppearanceSurface } from "../lib/appearance"
import { ItemCard, clearVisualCaches, uiIcon } from "./ItemCard"

export const WINDOW_NAME = "clipboard-window"

//: One refresh surface per monitor overlay, built on first construction. The
//: palette-refresh handler walks this list; it never reaches for window state,
//: so an unmapped/visible overlay keeps its exact query, selection and list.
const appearanceSurfaces: AppearanceSurface[] = []

/**
 * Rebuild every overlay's themed widgets from the current palette pointer.
 *
 * Called only by the app-level `palette-refresh` handler after `theme.apply()`.
 * It deliberately does not read history, change visibility, reset the query or
 * select a card: those belong to the user's open surface, not to the palette.
 */
export function refreshClipboardAppearance(): void {
  for (const surface of appearanceSurfaces) applyAppearance(surface)
}

// The overlay window's visibility controls. `hideWindow` already drove Escape
// and the copy/open paths; `show`/`toggle` are exposed so the instance request
// surface (app.tsx) drives the SAME window those keys drive. `app.get_window`
// returns the first registered window with the name -- the per-monitor overlay
// created below -- so all three target that one surface.
export function hideWindow(): void {
  const window = app.get_window(WINDOW_NAME)
  if (window) window.visible = false
}

export function showWindow(): void {
  const window = app.get_window(WINDOW_NAME)
  if (window) window.visible = true
}

export function toggleWindow(): void {
  const window = app.get_window(WINDOW_NAME)
  if (window) window.visible = !window.visible
}

/** The bottom layer-shell clipboard overlay (design D7). */
export function ClipboardWindow(gdkmonitor: Gdk.Monitor) {
  let items: ClipboardItem[] = []
  let query = ""
  let selected = 0
  let paused = false
  let jobId: string | null = null
  //: Card widgets for the currently shown list, in order, so navigation can
  //: move the highlight without rebuilding (rebuilding re-rasterized every
  //: icon and froze the machine under fast arrow repeats).
  let cards: Gtk.Widget[] = []
  //: Signature of the visible list the current `cards` were built from. A
  //: reopen whose history is unchanged reuses them instead of paying the
  //: measured ~430 ms rebuild (141 items) again.
  let builtKey: string | null = null
  //: Whether the surface is mapped; capture updates while hidden just refresh
  //: the in-memory list and rebuild lazily on the next show.
  let mapped = false

  //: The static search glyph is replaced on every appearance refresh. Keep the
  //: current widget and its parent header reachable so the swap never touches
  //: the entry, the query text or keyboard focus.
  let searchIcon = uiIcon("search", 18)
  const search = new Gtk.Entry({
    placeholder_text: "Search clipboard\u2026",
    hexpand: true,
  })
  search.add_css_class("clipboard-search")
  const incognito = new Gtk.Button({ label: "Incognito: off" })
  incognito.add_css_class("clipboard-incognito")
  const clear = new Gtk.Button({ label: "Clear" })
  clear.add_css_class("clipboard-clear")

  const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
  header.append(searchIcon)
  header.append(search)
  header.append(clear)
  header.append(incognito)

  //: Swap only the static glyph: the entry widget (and therefore its text and
  //: focus) is untouched.
  function rebuildSearchIcon(): void {
    const next = uiIcon("search", 18)
    header.remove(searchIcon)
    header.prepend(next)
    searchIcon = next
  }

  const list = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    css_classes: ["clipboard-list"],
    halign: Gtk.Align.START,
  })
  // Trailing spacer: absorbs any extra width so the fixed-width cards keep
  // their natural size instead of being stretched by the box.
  const spacer = new Gtk.Box()
  spacer.set_hexpand(true)
  const empty = new Gtk.Label({ label: "No clipboard history yet" })
  empty.add_css_class("clipboard-empty")

  const scroll = new Gtk.ScrolledWindow({
    hexpand: true,
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    vscrollbar_policy: Gtk.PolicyType.NEVER,
  })
  scroll.set_child(list)
  scroll.set_propagate_natural_width(true)

  function visibleItems(): ClipboardItem[] {
    return items.filter((item) => matchesQuery(item, query))
  }

  //: Identity of a visible list: same kinds + hashes in the same order means
  //: the existing cards still describe it (hashes are content-derived).
  function keyOf(shown: ClipboardItem[]): string {
    return shown.map((item) => `${item.kind}:${item.hash}`).join("\n")
  }

  function rebuild(): void {
    let child = list.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      list.remove(child)
      child = next
    }
    const shown = visibleItems()
    builtKey = keyOf(shown)
    cards = []
    empty.set_visible(shown.length === 0)
    list.set_visible(shown.length > 0)
    if (shown.length === 0) {
      selected = 0
      return
    }
    if (selected >= shown.length) selected = shown.length - 1
    if (selected < 0) selected = 0
    shown.forEach((item, index) => {
      const card = ItemCard(item, index + 1, select, openLink)
      cards.push(card)
      list.append(card)
    })
    list.append(spacer)
    applySelection(false)
  }

  //: Move only the "selected" CSS class between the existing cards and scroll
  //: the newly selected one into view. O(2) widget ops instead of a full
  //: teardown/rebuild, so held/repeated arrows stay cheap.
  function applySelection(scrollIntoView: boolean): void {
    cards.forEach((card, index) => {
      if (index === selected) card.add_css_class("selected")
      else card.remove_css_class("selected")
    })
    const card = cards[selected]
    if (!scrollIntoView || card === undefined) return
    try {
      const allocation = card.get_allocation()
      if (allocation.width <= 0) return
      const adjustment = scroll.get_hadjustment()
      const start = adjustment.get_value()
      const end = start + adjustment.get_page_size()
      if (allocation.x < start) {
        adjustment.set_value(allocation.x)
      } else if (allocation.x + allocation.width > end) {
        adjustment.set_value(allocation.x + allocation.width - adjustment.get_page_size())
      }
    } catch (error) {
      // A missing allocation must never break navigation.
      console.error(`clipboard: scroll-into-view failed: ${error}`)
    }
  }

  //: Re-read the document and sync the cheap state (visibility + highlight).
  //: Returns true when the visible list no longer matches the built cards and
  //: a rebuild is therefore required.
  function hydrate(): boolean {
    items = readHistory()
    selected = 0
    const shown = visibleItems()
    const changed = keyOf(shown) !== builtKey
    empty.set_visible(shown.length === 0)
    list.set_visible(shown.length > 0)
    applySelection(false)
    return changed
  }

  function reload(): void {
    if (hydrate()) rebuild()
  }

  function select(item: ClipboardItem): void {
    copyItem(item)
      .then(() => hideWindow())
      .catch((error: unknown) => console.error(`clipboard: copy failed: ${error}`))
  }

  //: Collapse the overlay, then hand the URL to xdg-open. Hyprland focuses the
  //: activated window (misc:focus_on_activate), so it navigates there.
  function openLink(item: ClipboardItem): void {
    hideWindow()
    const url = firstUrl(item.text)
    if (url !== null) openUrl(url)
  }

  function onKey(keyval: number, state: Gdk.ModifierType): boolean {
    const shown = visibleItems()
    if (keyval === Gdk.KEY_Escape) {
      hideWindow()
      return true
    }
    if (keyval === Gdk.KEY_Left) {
      selected = Math.max(0, selected - 1)
      applySelection(true)
      return true
    }
    if (keyval === Gdk.KEY_Right) {
      selected = Math.min(shown.length - 1, selected + 1)
      applySelection(true)
      return true
    }
    if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
      const item = shown[selected]
      if (item) select(item)
      return true
    }
    if (keyval === Gdk.KEY_Delete) {
      const item = shown[selected]
      if (item) {
        deleteItem(item.hash)
        reload()
      }
      return true
    }
    if (keyval === Gdk.KEY_f && (state & Gdk.ModifierType.CONTROL_MASK) !== 0) {
      const item = shown[selected]
      if (item) {
        toggleFavorite(item.hash)
        reload()
      }
      return true
    }
    if ((state & Gdk.ModifierType.CONTROL_MASK) !== 0) {
      const index = keyval - Gdk.KEY_1
      if (index >= 0 && index <= 8 && index < shown.length) {
        select(shown[index])
        return true
      }
    }
    return false
  }

  // Live updates: the daemon pushes clipboard.update per capture and
  // clipboard.state on transitions (subscribe-before-read; the platform's
  // event client owns the hydration state machine).
  domainEvents.subscribe("clipboard.update", (_topic: string, payload: DomainPayload) => {
    const item = itemFromPayload(payload as unknown as ClipboardUpdatePayload)
    const key = itemKey(item)
    items = [item, ...items.filter((existing) => itemKey(existing) !== key)]
    selected = 0
    if (mapped) rebuild()
  })
  domainEvents.subscribe("clipboard.state", (_topic: string, payload: DomainPayload) => {
    paused = payload.state === "paused"
    jobId = typeof payload.job_id === "string" && payload.job_id.length > 0 ? payload.job_id : null
    incognito.set_label(paused ? "Incognito: on" : "Incognito: off")
  })
  domainEvents.onRestart(reload)

  incognito.connect("clicked", () => {
    if (jobId === null) return
    domainEvents.control(jobId, paused ? "resume" : "pause")
  })

  clear.connect("clicked", () => {
    clearHistory()
    reload()
  })

  search.connect("changed", () => {
    query = search.get_text()
    selected = 0
    rebuild()
  })

  // The surface the app-level palette-refresh handler drives. `rebuild` here
  // is the FULL card rebuild (no `builtKey` short-circuit), because the old
  // cards hold textures and header-contrast decisions from the previous
  // palette. It keeps `items`, `query`, `selected`, `paused` and `jobId`.
  appearanceSurfaces.push({
    clearCaches: clearVisualCaches,
    rebuildSearchIcon,
    rebuildCards: rebuild,
  })

  return (
    <window
      visible={false}
      name={WINDOW_NAME}
      class="clipboard-window"
      gdkmonitor={gdkmonitor}
      anchor={
        Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT
      }
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      margin_bottom={24}
      margin_left={12}
      margin_right={12}
      $={(self) => {
        // Capture phase: navigation keys (arrows/Enter/Ctrl+digits/Delete)
        // must be seen BEFORE the focused SearchEntry consumes them.
        const keys = new Gtk.EventControllerKey()
        keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        keys.connect("key-pressed", (_controller, keyval, _keycode, state) =>
          onKey(keyval, state),
        )
        self.add_controller(keys)
        // Hydrate from disk on every open so the overlay reflects captures
        // that happened while it was hidden, even with no hub signal.
        self.connect("map", () => {
          mapped = true
          // ON_DEMAND (like the capture tool and ICME) so the overlay never
          // grabs the keyboard from other AGS windows; present() asks the
          // compositor to focus the surface on show.
          //
          // Present BEFORE the rebuild: constructing ~140 cards (measured
          // ~430 ms on a full history) used to run synchronously in this
          // handler, so the first frame did not land until it finished and the
          // overlay appeared blank for that long. Showing first and deferring
          // the rebuild to an idle callback puts the surface on screen
          // immediately, then fills the cards in.
          self.present()
          search.grab_focus()
          // hydrate() itself is cheap (~0.4 ms read); it reports whether the
          // visible list changed, which is what gates the expensive rebuild.
          if (!hydrate()) return
          GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            // Re-check: a search keystroke or a live capture may have rebuilt
            // the cards between the map and this callback.
            if (mapped && keyOf(visibleItems()) !== builtKey) rebuild()
            return false
          })
        })
        self.connect("unmap", () => {
          mapped = false
        })
      }}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        spacing={8}
        css_classes={["clipboard-panel"]}
        $={(self) => {
          self.append(header)
          self.append(scroll)
          self.append(empty)
        }}
      />
    </window>
  )
}
