import { Astal, Gdk, Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
// The one domain-event client (spine AD-5): the app consumes the platform's
// shared client instead of a local event-bus copy. Topics are the contract
// names, passed as literals exactly as the bar does for `capture.state`.
import { domainEvents, type DomainPayload } from "ags-platform/adapters/event-bus"
import type { ReadAccessor } from "ags-platform/ports/reactive"
import {
  itemFromPayload,
  itemKey,
  type ClipboardItem,
  type ClipboardUpdatePayload,
} from "../lib/clipboard-types"
import {
  clearHistory,
  copyItem,
  deleteItem,
  firstUrl,
  openUrl,
  purgeItemImage,
  readHistory,
  restoreItem,
  toggleFavorite,
} from "../lib/history"
import {
  filterCompactView,
  initialPinFocus,
  itemByKey,
  moveCompactSelection,
  nextCompactView,
  nextPinFocus,
  ordered,
  pinCopyTarget,
  pinnedOrdered,
  type TypeFilter,
  TYPE_FILTERS,
} from "../lib/card-modes"
import {
  compactCardWidth,
  compactIsVertical,
  normalizeSettings,
  settingsFor,
  type ClipboardSettings,
  type CompactAlignment,
  type CompactSize,
  type CompactView,
  type LayoutMode,
} from "../lib/settings"
import { loadSettings, saveSettings, type SettingsPort } from "../lib/settings-store"
import { createGlibSettingsPort } from "../lib/settings-glib"
import { applyAppearance, type AppearanceSurface } from "../lib/appearance"
import {
  ItemCard,
  ItemHead,
  PeekCard,
  PinCard,
  StageCard,
  TYPE_LABEL,
  clearVisualCaches,
  relativeTime,
  uiIcon,
} from "./ItemCard"

export const WINDOW_NAME = "clipboard-window"

//: One refresh surface per monitor overlay, built on first construction. The
//: appearance-refresh handler walks this list; it never reaches for window
//: state, so an unmapped/visible overlay keeps its exact query, selection and
//: list.
const appearanceSurfaces: AppearanceSurface[] = []

/**
 * Rebuild every overlay's themed widgets from the requested generation.
 *
 * Called only by the app-level `appearance-refresh` handler after the platform
 * helper re-applies the requested generation. It deliberately does not read
 * history, change visibility, reset the query or select a card: those belong
 * to the user's open surface, not to the appearance.
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

function clearChildren(widget: Gtk.Widget): void {
  let child = widget.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    child.unparent()
    child = next
  }
}

function childrenOf(widget: Gtk.Widget): Gtk.Widget[] {
  const children: Gtk.Widget[] = []
  let child = widget.get_first_child()
  while (child) {
    children.push(child)
    child = child.get_next_sibling()
  }
  return children
}

function label(text: string, cssClass?: string): Gtk.Label {
  const widget = new Gtk.Label({ label: text, xalign: 0 })
  if (cssClass !== undefined) widget.add_css_class(cssClass)
  return widget
}

function button(text: string, cssClass?: string): Gtk.Button {
  const widget = new Gtk.Button({ label: text })
  if (cssClass !== undefined) widget.add_css_class(cssClass)
  return widget
}

function row(spacing = 8): Gtk.Box {
  return new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing })
}

function column(spacing = 8): Gtk.Box {
  return new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing })
}

interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface Segment<T extends string> {
  widget: Gtk.Box
  refresh(): void
}

function segmented<T extends string>(
  options: readonly SegmentOption<T>[],
  current: () => T,
  pick: (value: T) => void,
  enabled: () => boolean,
): Segment<T> {
  const widget = row(4)
  widget.add_css_class("clipboard-segment")
  const buttons: { value: T; widget: Gtk.Button }[] = []
  for (const option of options) {
    const item = new Gtk.Button({ label: option.label })
    item.add_css_class("clipboard-segment-button")
    item.connect("clicked", () => pick(option.value))
    widget.append(item)
    buttons.push({ value: option.value, widget: item })
  }
  return {
    widget,
    refresh() {
      const active = current()
      const on = enabled()
      for (const entry of buttons) {
        if (entry.value === active) entry.widget.add_css_class("selected")
        else entry.widget.remove_css_class("selected")
        entry.widget.set_sensitive(on)
      }
      widget.set_sensitive(true)
    },
  }
}

/** The bottom layer-shell clipboard overlay (design D7). */
export function ClipboardWindow(
  gdkmonitor: Gdk.Monitor,
  cardWidth: ReadAccessor<number>,
  settingsPort: SettingsPort = createGlibSettingsPort(),
) {
  const geometry = gdkmonitor.get_geometry()

  let items: ClipboardItem[] = []
  let settings: ClipboardSettings = loadSettings(settingsPort)
  let mode: LayoutMode = settings.layout.mode
  let compactSize: CompactSize = settings.layout.compact.card_size
  let compactAlign: CompactAlignment = settings.layout.compact.alignment
  let query = ""
  let filter: TypeFilter = "all"
  //: Stable `kind:hash` identity of the selected card.
  let selectedKey: string | null = null
  let compactView: CompactView = "recent"
  let pinsOpen = false
  let focusedPinKey: string | null = null
  let clearConfirm = false
  let paused = false
  let jobId: string | null = null
  //: Captures that arrived while the overlay was open. Selecting the newest
  //: one clears them; they never steal the current selection.
  let newKeys: string[] = []
  //: Delete undo buffer + the timeout that retires it.
  let undo: { item: ClipboardItem; selected: string | null } | null = null
  let undoTimer = 0
  //: Whether the surface is mapped; capture updates while hidden just refresh
  //: the in-memory list and rebuild lazily on the next show.
  let mapped = false
  let overlay: Astal.Window | null = null

  // ── persistent widgets ───────────────────────────────────────────────────

  const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
  root.add_css_class("clipboard-root")
  root.set_vexpand(true)
  root.set_hexpand(true)

  // Full stage
  const fullRoot = column(10)
  fullRoot.add_css_class("clipboard-full")
  fullRoot.set_vexpand(true)
  fullRoot.set_hexpand(true)

  const brand = label("Clipboard", "clipboard-brand")
  const fullCount = label("0", "clipboard-count")
  const pinsPill = button("Pinned (0)", "clipboard-pins-pill")
  const fullGear = new Gtk.MenuButton({ css_classes: ["clipboard-gear"] })
  fullGear.set_child(uiIcon("settings", 18))
  fullGear.set_tooltip_text("Settings")
  const fullTop = row(10)
  fullTop.add_css_class("clipboard-full-top")
  const fullTopSpacer = new Gtk.Box()
  fullTopSpacer.set_hexpand(true)
  fullTop.append(brand)
  fullTop.append(fullCount)
  fullTop.append(fullTopSpacer)
  fullTop.append(pinsPill)
  fullTop.append(fullGear)

  const stageSlot = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
  stageSlot.set_valign(Gtk.Align.CENTER)
  stageSlot.set_hexpand(true)
  const stageArea = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 18,
    halign: Gtk.Align.CENTER,
  })
  stageArea.add_css_class("clipboard-stage")
  const prevArrow = button("\u2190", "clipboard-nav-arrow")
  const nextArrow = button("\u2192", "clipboard-nav-arrow")
  const prevPeek = new Gtk.Box()
  const nextPeek = new Gtk.Box()
  stageArea.append(prevArrow)
  stageArea.append(prevPeek)
  stageArea.append(stageSlot)
  stageArea.append(nextPeek)
  stageArea.append(nextArrow)

  const barIndex = label("0 / 0", "clipboard-bar-index")
  const barType = label("No cards", "clipboard-bar-type")
  const barMeta = column(2)
  barMeta.add_css_class("clipboard-bar-meta")
  barMeta.append(barIndex)
  barMeta.append(barType)
  const copyButton = button("Copy", "clipboard-bar-button")
  copyButton.add_css_class("primary")
  const pinButton = button("Pin", "clipboard-bar-button")
  const deleteButton = button("Delete", "clipboard-bar-button")
  deleteButton.add_css_class("danger")
  const openButton = button("Open", "clipboard-bar-button")
  const fullHints = label("\u2190 \u2192 cards \u00b7 \u2191 pinned \u00b7 \u2193 back", "clipboard-hints")
  const controlBar = row(6)
  controlBar.add_css_class("clipboard-control-bar")
  const barActions = row(6)
  barActions.append(copyButton)
  barActions.append(pinButton)
  barActions.append(deleteButton)
  barActions.append(openButton)
  const barSpacer = new Gtk.Box()
  barSpacer.set_hexpand(true)
  controlBar.append(barMeta)
  controlBar.append(barSpacer)
  controlBar.append(barActions)
  controlBar.append(fullHints)

  const pinsTitle = label("Pinned \u00b7 0", "clipboard-pins-title")
  const pinsHints = label("\u2190 \u2192 select \u00b7 \u21b5 copy \u00b7 \u2193 back", "clipboard-hints")
  const pinsBack = button("Back", "clipboard-back")
  const pinsHead = row(12)
  pinsHead.add_css_class("clipboard-pins-head")
  pinsHead.append(pinsTitle)
  pinsHead.append(pinsHints)
  const pinsSpacer = new Gtk.Box()
  pinsSpacer.set_hexpand(true)
  pinsHead.append(pinsSpacer)
  pinsHead.append(pinsBack)
  const pinsGrid = new Gtk.Grid({ column_spacing: 12, row_spacing: 12 })
  pinsGrid.add_css_class("clipboard-pins-grid")
  pinsGrid.set_hexpand(true)
  pinsGrid.set_halign(Gtk.Align.CENTER)
  const pinsScroll = new Gtk.ScrolledWindow({
    hexpand: true,
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
  })
  pinsScroll.set_child(pinsGrid)
  const pinsPanel = column(12)
  pinsPanel.add_css_class("clipboard-pins-panel")
  pinsPanel.set_vexpand(true)
  pinsPanel.append(pinsHead)
  pinsPanel.append(pinsScroll)

  const fullBody = column(10)
  fullBody.set_vexpand(true)
  fullBody.append(stageArea)
  fullBody.append(controlBar)
  fullRoot.append(fullTop)
  fullRoot.append(fullBody)

  // Compact strip
  const compactRoot = column(10)
  compactRoot.add_css_class("clipboard-compact")
  compactRoot.set_vexpand(true)
  compactRoot.set_hexpand(true)

  let searchIcon = uiIcon("search", 18)
  const search = new Gtk.Entry({ placeholder_text: "Search clipboard\u2026", hexpand: true })
  search.add_css_class("clipboard-search")
  const searchBox = row(8)
  searchBox.add_css_class("clipboard-search-box")
  searchBox.append(searchIcon)
  searchBox.append(search)

  const filterChips = new Map<TypeFilter, Gtk.Button>()
  const filters = new Gtk.FlowBox({
    selection_mode: Gtk.SelectionMode.NONE,
    row_spacing: 4,
    column_spacing: 4,
    max_children_per_line: 8,
  })
  filters.add_css_class("clipboard-filters")
  filters.set_hexpand(true)
  const FILTER_LABEL: Record<TypeFilter, string> = {
    all: "All",
    text: "Text",
    link: "Links",
    code: "Code",
    image: "Images",
    color: "Colors",
    emoji: "Emoji",
  }
  for (const value of TYPE_FILTERS) {
    const chip = button(FILTER_LABEL[value], "clipboard-chip")
    chip.connect("clicked", () => {
      filter = value
      ensureSelection()
      renderCompact()
    })
    filters.append(chip)
    filterChips.set(value, chip)
  }

  const incognito = button("Incognito: off", "clipboard-incognito")
  const clearButton = button("Clear", "clipboard-clear")
  const clearYes = button("Clear", "clipboard-confirm-yes")
  const clearNo = button("Cancel", "clipboard-confirm-no")
  const clearConfirmBox = row(4)
  clearConfirmBox.add_css_class("clipboard-clear-confirm")
  clearConfirmBox.append(label("Clear all?", "clipboard-confirm-label"))
  clearConfirmBox.append(clearNo)
  clearConfirmBox.append(clearYes)
  const compactGear = new Gtk.MenuButton({ css_classes: ["clipboard-gear"] })
  compactGear.set_child(uiIcon("settings", 18))
  compactGear.set_tooltip_text("Settings")
  const compactActions = row(6)
  compactActions.add_css_class("clipboard-compact-actions")
  compactActions.append(incognito)
  compactActions.append(clearButton)
  compactActions.append(clearConfirmBox)
  compactActions.append(compactGear)

  const compactTop = row(10)
  compactTop.add_css_class("clipboard-compact-top")
  compactTop.append(searchBox)
  compactTop.append(filters)
  compactTop.append(compactActions)

  const recentTab = button("Recent", "clipboard-view-tab")
  const pinnedTab = button("Pinned (0)", "clipboard-view-tab")
  const compactStatus = label("0 recent", "clipboard-status")
  const newBadge = button("0 new", "clipboard-new-badge")
  const viewBar = row(2)
  viewBar.add_css_class("clipboard-viewbar")
  viewBar.append(recentTab)
  viewBar.append(pinnedTab)
  viewBar.append(compactStatus)
  const viewSpacer = new Gtk.Box()
  viewSpacer.set_hexpand(true)
  viewBar.append(viewSpacer)
  viewBar.append(newBadge)

  const compactList = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    halign: Gtk.Align.START,
  })
  compactList.add_css_class("clipboard-list")
  const compactScroll = new Gtk.ScrolledWindow({
    hexpand: true,
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    vscrollbar_policy: Gtk.PolicyType.NEVER,
  })
  compactScroll.set_child(compactList)
  compactScroll.set_propagate_natural_width(true)
  const stripPrev = button("\u2039", "clipboard-strip-arrow")
  const stripNext = button("\u203a", "clipboard-strip-arrow")
  const stripUp = button("\u2191", "clipboard-strip-arrow")
  const stripDown = button("\u2193", "clipboard-strip-arrow")
  const strip = row(8)
  strip.add_css_class("clipboard-strip")
  strip.append(stripPrev)
  strip.append(stripUp)
  strip.append(compactScroll)
  strip.append(stripNext)
  strip.append(stripDown)
  const compactHints = label("", "clipboard-hints")
  compactRoot.append(compactTop)
  compactRoot.append(viewBar)
  compactRoot.append(strip)
  compactRoot.append(compactHints)

  root.append(fullRoot)
  root.append(compactRoot)
  root.append(pinsPanel)

  // ── settings popovers ────────────────────────────────────────────────────

  const settingsRefreshers: (() => void)[] = []

  function persist(): void {
    settings = saveSettings(
      settingsPort,
      settingsFor(mode, compactSize, compactAlign),
    )
    settings = normalizeSettings(settings)
    mode = settings.layout.mode
    compactSize = settings.layout.compact.card_size
    compactAlign = settings.layout.compact.alignment
  }

  function refreshSettings(): void {
    for (const refresh of settingsRefreshers) refresh()
  }

  function setMode(next: LayoutMode): void {
    if (next === mode) return
    mode = next
    if (mode === "compact") {
      pinsOpen = false
      focusedPinKey = null
      compactView = "recent"
    }
    persist()
    ensureSelection()
    applyMode()
    renderAll()
    refreshSettings()
  }

  function setCompactSize(next: CompactSize): void {
    if (mode !== "compact" || next === compactSize) return
    compactSize = next
    persist()
    applyMode()
    renderCompact()
    refreshSettings()
  }

  function setCompactAlign(next: CompactAlignment): void {
    if (mode !== "compact" || next === compactAlign) return
    compactAlign = next
    persist()
    applyMode()
    renderAll()
    refreshSettings()
  }

  function buildSettingsPopover(): Gtk.Popover {
    const popover = new Gtk.Popover()
    const content = column(12)
    content.add_css_class("clipboard-settings")
    content.set_margin_top(12)
    content.set_margin_bottom(12)
    content.set_margin_start(12)
    content.set_margin_end(12)

    const layoutRow = column(4)
    layoutRow.append(label("Layout", "clipboard-setting-label"))
    const layoutSeg = segmented<LayoutMode>(
      [
        { value: "full", label: "Full" },
        { value: "compact", label: "Compact" },
      ],
      () => mode,
      setMode,
      () => true,
    )
    layoutRow.append(layoutSeg.widget)

    const sizeRow = column(4)
    sizeRow.add_css_class("clipboard-setting-row")
    sizeRow.append(label("Compact card size", "clipboard-setting-label"))
    const sizeSeg = segmented<CompactSize>(
      [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      () => compactSize,
      setCompactSize,
      () => mode === "compact",
    )
    sizeRow.append(sizeSeg.widget)

    const alignRow = column(4)
    alignRow.add_css_class("clipboard-setting-row")
    alignRow.append(label("Compact alignment", "clipboard-setting-label"))
    const alignSeg = segmented<CompactAlignment>(
      [
        { value: "bottom", label: "Bottom" },
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
      () => compactAlign,
      setCompactAlign,
      () => mode === "compact",
    )
    alignRow.append(alignSeg.widget)

    content.append(layoutRow)
    content.append(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }))
    content.append(sizeRow)
    content.append(alignRow)
    popover.set_child(content)

    settingsRefreshers.push(() => {
      layoutSeg.refresh()
      sizeSeg.refresh()
      alignSeg.refresh()
      for (const target of [sizeRow, alignRow]) {
        if (mode === "compact") target.remove_css_class("disabled")
        else target.add_css_class("disabled")
      }
    })
    return popover
  }

  fullGear.set_popover(buildSettingsPopover())
  compactGear.set_popover(buildSettingsPopover())

  function settingsOpen(): boolean {
    return fullGear.get_active() || compactGear.get_active()
  }

  // ── list + selection helpers ─────────────────────────────────────────────

  function deck(): ClipboardItem[] {
    return ordered(items)
  }

  function compactListItems(): ClipboardItem[] {
    return filterCompactView(items, query, filter, compactView)
  }

  function activeList(): ClipboardItem[] {
    return mode === "full" ? deck() : compactListItems()
  }

  function selectedItem(): ClipboardItem | null {
    return itemByKey(items, selectedKey)
  }

  function ensureSelection(): void {
    const list = activeList()
    if (list.length === 0) return
    if (!list.some((item) => itemKey(item) === selectedKey)) {
      selectedKey = itemKey(list[0])
    }
  }

  function selectByKey(key: string | null, scroll = false): void {
    if (key === null) return
    selectedKey = key
    newKeys = newKeys.filter((entry) => entry !== key)
    if (mode === "full") renderFull()
    else renderCompact()
    if (mode === "full" && pinsOpen) renderPins()
    if (scroll) scrollSelectedIntoView()
  }

  function scrollSelectedIntoView(): void {
    if (mode !== "compact") return
    const card = childrenOf(compactList)
      .find((child) => child.get_css_classes().includes(`key-${cssKey(selectedKey)}`))
    if (card === undefined) return
    try {
      const allocation = card.get_allocation()
      if (compactIsVertical(compactAlign)) {
        const adjustment = compactScroll.get_vadjustment()
        const start = adjustment.get_value()
        const end = start + adjustment.get_page_size()
        if (allocation.y < start) adjustment.set_value(allocation.y)
        else if (allocation.y + allocation.height > end) {
          adjustment.set_value(allocation.y + allocation.height - adjustment.get_page_size())
        }
      } else {
        const adjustment = compactScroll.get_hadjustment()
        const start = adjustment.get_value()
        const end = start + adjustment.get_page_size()
        if (allocation.x < start) adjustment.set_value(allocation.x)
        else if (allocation.x + allocation.width > end) {
          adjustment.set_value(allocation.x + allocation.width - adjustment.get_page_size())
        }
      }
    } catch (error) {
      console.error(`clipboard: scroll-into-view failed: ${error}`)
    }
  }

  // CSS class-safe marker for the selected card (hash may contain odd chars).
  function cssKey(key: string | null): string {
    return key === null ? "none" : key.replace(/[^a-zA-Z0-9_-]/g, "_")
  }

  // ── copy / pin / delete / open ───────────────────────────────────────────

  function copyOnly(item: ClipboardItem): void {
    copyItem(item)
      .then(() => {
        newKeys = newKeys.filter((entry) => entry !== itemKey(item))
        if (mapped) {
          if (mode === "full") renderFull()
          else renderCompact()
        }
      })
      .catch((error: unknown) => console.error(`clipboard: copy failed: ${error}`))
  }

  function copyAndCollapse(item: ClipboardItem): void {
    copyItem(item)
      .then(() => hideWindow())
      .catch((error: unknown) => console.error(`clipboard: copy failed: ${error}`))
  }

  function openLink(item: ClipboardItem): void {
    if (item.kind !== "link") return
    const url = firstUrl(item.text)
    if (url === null) return
    // Same path in every mode: collapse the overlay, then hand the URL to
    // xdg-open. Hyprland focuses the activated browser window.
    hideWindow()
    openUrl(url)
  }

  function togglePin(item: ClipboardItem): void {
    toggleFavorite(item.hash)
    items = readHistory()
    ensureSelection()
    if (mode === "full") {
      renderFull()
      if (pinsOpen) renderPins()
    } else {
      renderCompact()
    }
  }

  function scheduleUndoRetire(): void {
    if (undoTimer !== 0) GLib.source_remove(undoTimer)
    undoTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 6, () => {
      if (undo !== null && undo.item.path !== null) purgeItemImage(undo.item)
      undo = null
      undoTimer = 0
      return false
    })
  }

  function deleteSelected(): void {
    const item = selectedItem()
    if (item === null) return
    const list = activeList()
    const index = list.findIndex((entry) => itemKey(entry) === itemKey(item))
    const next = list[index + 1] ?? list[index - 1] ?? null
    const removed = deleteItem(item.hash, { keepImage: true })
    if (removed === null) return
    items = readHistory()
    selectedKey = next === null ? null : itemKey(next)
    ensureSelection()
    undo = { item: removed, selected: selectedKey }
    scheduleUndoRetire()
    if (mode === "full") renderFull()
    else renderCompact()
    if (pinsOpen) renderPins()
  }

  function undoDelete(): void {
    if (undo === null) return
    const entry = undo
    undo = null
    if (undoTimer !== 0) {
      GLib.source_remove(undoTimer)
      undoTimer = 0
    }
    restoreItem(entry.item)
    items = readHistory()
    selectedKey = itemKey(entry.item)
    ensureSelection()
    if (mode === "full") renderFull()
    else renderCompact()
    if (pinsOpen) renderPins()
  }

  function setView(next: CompactView): void {
    if (next === compactView) return
    if (next === "pinned" && !items.some((item) => item.favorite)) return
    compactView = next
    ensureSelection()
    renderCompact()
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      scrollSelectedIntoView()
      return false
    })
  }

  function toggleCompactView(): void {
    const next = nextCompactView(compactView, items.some((item) => item.favorite))
    if (next !== compactView) setView(next)
  }

  function jumpToNewest(): void {
    const key = newKeys[0]
    if (key === undefined) return
    selectByKey(key, true)
  }

  // ── rendering ────────────────────────────────────────────────────────────

  function compactWidth(): number {
    return compactSize === "medium" ? cardWidth.peek() : compactCardWidth(compactSize)
  }

  function stageSize(): { width: number; height: number } {
    return {
      width: Math.max(420, Math.min(720, geometry.width - 240)),
      height: Math.max(340, Math.min(460, geometry.height - 220)),
    }
  }

  function renderFull(): void {
    const list = deck()
    ensureSelection()
    const pins = pinnedOrdered(items)
    fullCount.set_label(String(items.length))
    pinsPill.set_label(`Pinned (${pins.length})`)
    if (pins.length === 0) pinsPill.add_css_class("empty")
    else pinsPill.remove_css_class("empty")

    const { width, height } = stageSize()
    clearChildren(stageSlot)
    clearChildren(prevPeek)
    clearChildren(nextPeek)

    if (list.length === 0) {
      const empty = column(6)
      empty.add_css_class("clipboard-stage-empty")
      empty.set_valign(Gtk.Align.CENTER)
      empty.set_halign(Gtk.Align.CENTER)
      empty.append(label("Clipboard is empty", "clipboard-empty-title"))
      empty.append(label("Copy something and it will appear here.", "clipboard-empty-detail"))
      stageSlot.append(empty)
      prevArrow.set_sensitive(false)
      nextArrow.set_sensitive(false)
      barIndex.set_label("0 / 0")
      barType.set_label("No cards")
      for (const target of [copyButton, pinButton, deleteButton, openButton]) {
        target.set_sensitive(false)
      }
      openButton.set_visible(false)
      return
    }

    const index = Math.max(
      0,
      list.findIndex((item) => itemKey(item) === selectedKey),
    )
    const item = list[index] ?? list[0]
    selectedKey = itemKey(item)
    stageSlot.append(StageCard(item, copyAndCollapse, openLink, width, height))
    const prev = list[(index - 1 + list.length) % list.length]
    const next = list[(index + 1) % list.length]
    prevPeek.append(PeekCard(list.length > 1 ? prev : null, (target) => selectByKey(itemKey(target)), 152, Math.round(height * 0.72)))
    nextPeek.append(PeekCard(list.length > 1 ? next : null, (target) => selectByKey(itemKey(target)), 152, Math.round(height * 0.72)))
    prevArrow.set_sensitive(list.length > 1)
    nextArrow.set_sensitive(list.length > 1)

    barIndex.set_label(`${index + 1} / ${list.length}`)
    barType.set_label(
      `${TYPE_LABEL[item.kind]} \u00b7 ${relativeTime(item.timestamp)}${item.favorite ? " \u00b7 pinned" : ""}`,
    )
    copyButton.set_sensitive(true)
    pinButton.set_sensitive(true)
    pinButton.set_label(item.favorite ? "Unpin" : "Pin")
    if (item.favorite) pinButton.add_css_class("is-on")
    else pinButton.remove_css_class("is-on")
    deleteButton.set_sensitive(true)
    openButton.set_visible(item.kind === "link")
    openButton.set_sensitive(item.kind === "link")
    fullHints.set_label("\u2190 \u2192 cards \u00b7 \u2191 pinned \u00b7 \u2193 back")
  }

  function renderPins(): void {
    const list = deck()
    const pins = pinnedOrdered(items)
    pinsTitle.set_label(`Pinned \u00b7 ${pins.length}`)
    pinsHints.set_label("\u2190 \u2192 select \u00b7 \u21b5 copy \u00b7 \u2193 back")
    clearChildren(pinsGrid)
    if (pins.length === 0) {
      focusedPinKey = null
      const empty = column(6)
      empty.add_css_class("clipboard-pins-empty")
      empty.set_halign(Gtk.Align.CENTER)
      empty.append(label("No pinned cards", "clipboard-empty-title"))
      empty.append(label("Pin a card with Ctrl+F, then it appears here.", "clipboard-empty-detail"))
      pinsGrid.attach(empty, 0, 0, 4, 1)
      return
    }
    if (pinsOpen && initialPinFocus(items, selectedKey) !== focusedPinKey) {
      if (focusedPinKey === null || !pins.some((item) => itemKey(item) === focusedPinKey)) {
        focusedPinKey = initialPinFocus(items, selectedKey)
      }
    }
    const cardW = Math.max(180, Math.floor((geometry.width - 120) / 4) - 12)
    pins.forEach((item, index) => {
      const deckIndex = list.findIndex((entry) => itemKey(entry) === itemKey(item)) + 1
      const card = PinCard(
        item,
        deckIndex,
        itemKey(item) === focusedPinKey,
        (target) => {
          focusedPinKey = itemKey(target)
          copyFocusedPin(itemKey(target))
        },
        cardW,
      )
      pinsGrid.attach(card, index % 4, Math.floor(index / 4), 1, 1)
    })
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      scrollFocusedPinIntoView()
      return false
    })
  }

  function scrollFocusedPinIntoView(): void {
    if (focusedPinKey === null) return
    const card = childrenOf(pinsGrid)
      .find((child) => child.has_css_class("focused"))
    if (card === undefined) return
    try {
      const allocation = card.get_allocation()
      const adjustment = pinsScroll.get_vadjustment()
      const start = adjustment.get_value()
      const end = start + adjustment.get_page_size()
      if (allocation.y < start) adjustment.set_value(allocation.y)
      else if (allocation.y + allocation.height > end) {
        adjustment.set_value(allocation.y + allocation.height - adjustment.get_page_size())
      }
    } catch (error) {
      console.error(`clipboard: pinned scroll-into-view failed: ${error}`)
    }
  }

  function copyFocusedPin(key: string | null = focusedPinKey): void {
    const target = pinCopyTarget(items, key)
    if (target === null) return
    const item = itemByKey(items, target)
    if (item === null) return
    copyItem(item)
      .then(() => {
        closePins()
        hideWindow()
      })
      .catch((error: unknown) => console.error(`clipboard: copy failed: ${error}`))
  }

  function openPins(): void {
    if (mode !== "full") return
    pinsOpen = true
    focusedPinKey = initialPinFocus(items, selectedKey)
    applyMode()
    renderPins()
  }

  function closePins(): void {
    if (!pinsOpen) return
    pinsOpen = false
    focusedPinKey = null
    applyMode()
  }

  function movePins(delta: number): void {
    const next = nextPinFocus(items, focusedPinKey, delta)
    if (next === null || next === focusedPinKey) return
    focusedPinKey = next
    renderPins()
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      scrollFocusedPinIntoView()
      return false
    })
  }

  function renderCompact(): void {
    const pins = items.filter((item) => item.favorite).length
    if (compactView === "pinned" && pins === 0) {
      compactView = "recent"
      ensureSelection()
    }
    const list = compactListItems()
    const vertical = compactIsVertical(compactAlign)

    for (const [value, chip] of filterChips) {
      if (value === filter) chip.add_css_class("selected")
      else chip.remove_css_class("selected")
    }

    pinnedTab.set_label(`Pinned (${pins})`)
    pinnedTab.set_visible(pins > 0)
    pinnedTab.set_sensitive(pins > 0)
    if (compactView === "pinned") {
      recentTab.remove_css_class("active")
      pinnedTab.add_css_class("active")
    } else {
      recentTab.add_css_class("active")
      pinnedTab.remove_css_class("active")
    }
    recentTab.set_sensitive(true)

    const viewLabel = compactView === "pinned" ? "pinned" : "recent"
    compactStatus.set_label(`${list.length} ${viewLabel}`)
    newBadge.set_visible(newKeys.length > 0)
    newBadge.set_label(`${newKeys.length} new`)

    compactList.set_orientation(
      vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
    )
    compactList.set_halign(vertical ? Gtk.Align.FILL : Gtk.Align.START)
    strip.set_orientation(vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL)
    compactTop.set_orientation(vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL)
    compactScroll.set_policy(
      vertical ? Gtk.PolicyType.NEVER : Gtk.PolicyType.AUTOMATIC,
      vertical ? Gtk.PolicyType.AUTOMATIC : Gtk.PolicyType.NEVER,
    )
    stripPrev.set_visible(!vertical)
    stripNext.set_visible(!vertical)
    stripUp.set_visible(vertical)
    stripDown.set_visible(vertical)
    compactRoot.remove_css_class("align-bottom")
    compactRoot.remove_css_class("align-left")
    compactRoot.remove_css_class("align-right")
    compactRoot.add_css_class(`align-${compactAlign}`)

    incognito.set_label(paused ? "Incognito: on" : "Incognito: off")
    if (paused) incognito.add_css_class("is-on")
    else incognito.remove_css_class("is-on")
    clearButton.set_visible(!clearConfirm)
    clearConfirmBox.set_visible(clearConfirm)

    compactHints.set_label(compactHintText())

    clearChildren(compactList)
    if (items.length === 0) {
      const empty = column(4)
      empty.add_css_class("clipboard-empty")
      empty.set_halign(Gtk.Align.CENTER)
      empty.set_valign(Gtk.Align.CENTER)
      empty.append(label("Clipboard is empty", "clipboard-empty-title"))
      empty.append(label("Copy something and it will appear here.", "clipboard-empty-detail"))
      compactList.append(empty)
      return
    }
    if (list.length === 0) {
      const empty = column(4)
      empty.add_css_class("clipboard-empty")
      empty.set_halign(Gtk.Align.CENTER)
      empty.set_valign(Gtk.Align.CENTER)
      empty.append(
        label(
          compactView === "pinned" ? "No pinned matches" : "No recent matches",
          "clipboard-empty-title",
        ),
      )
      empty.append(label("Try another search or filter.", "clipboard-empty-detail"))
      compactList.append(empty)
      return
    }
    ensureSelection()
    const width = compactWidth()
    list.forEach((item, index) => {
      const card = ItemCard(
        item,
        index + 1,
        (target) => selectByKey(itemKey(target)),
        openLink,
        width,
        (target) => copyOnly(target),
      )
      if (vertical) card.set_halign(Gtk.Align.FILL)
      card.add_css_class(`key-${cssKey(itemKey(item))}`)
      if (itemKey(item) === selectedKey) card.add_css_class("selected")
      compactList.append(card)
    })
    // Trailing spacer: absorbs any extra width so the fixed-width cards keep
    // their natural size instead of being stretched by the box.
    const spacer = new Gtk.Box()
    spacer.set_hexpand(true)
    compactList.append(spacer)
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      scrollSelectedIntoView()
      return false
    })
  }

  function compactHintText(): string {
    const hasPins = items.some((item) => item.favorite)
    const typing = search.has_focus
    if (compactIsVertical(compactAlign)) {
      if (!hasPins) return "\u2191\u2193 cards \u00b7 \u21b5 copy"
      return typing
        ? "\u2191\u2193 cards \u00b7 Tab view"
        : "\u2191\u2193 cards \u00b7 \u2190\u2192 view \u00b7 Tab view"
    }
    if (!hasPins) return "\u2190 \u2192 cards \u00b7 \u21b5 copy \u00b7 Esc"
    return "\u2190 \u2192 cards \u00b7 \u2191\u2193 view \u00b7 Tab view \u00b7 \u21b5 copy \u00b7 Esc"
  }

  function renderAll(): void {
    ensureSelection()
    if (mode === "full") renderFull()
    else renderCompact()
    if (pinsOpen) renderPins()
  }

  // ── mode / window layout ─────────────────────────────────────────────────

  function applyWindowLayout(): void {
    if (overlay === null) return
    const top = Astal.WindowAnchor.TOP
    const bottom = Astal.WindowAnchor.BOTTOM
    const left = Astal.WindowAnchor.LEFT
    const right = Astal.WindowAnchor.RIGHT
    if (mode === "full") {
      overlay.anchor = (top | bottom | left | right) as Astal.WindowAnchor
      overlay.margin_top = 0
      overlay.margin_bottom = 0
      overlay.margin_left = 0
      overlay.margin_right = 0
      return
    }
    if (compactAlign === "left") {
      overlay.anchor = (top | bottom | left) as Astal.WindowAnchor
      overlay.margin_top = 52
      overlay.margin_bottom = 12
      overlay.margin_left = 12
      overlay.margin_right = 0
    } else if (compactAlign === "right") {
      overlay.anchor = (top | bottom | right) as Astal.WindowAnchor
      overlay.margin_top = 52
      overlay.margin_bottom = 12
      overlay.margin_left = 0
      overlay.margin_right = 12
    } else {
      overlay.anchor = (bottom | left | right) as Astal.WindowAnchor
      overlay.margin_top = 0
      overlay.margin_bottom = 12
      overlay.margin_left = 12
      overlay.margin_right = 12
    }
  }

  function applyMode(): void {
    const full = mode === "full"
    fullRoot.set_visible(full && !pinsOpen)
    compactRoot.set_visible(!full)
    pinsPanel.set_visible(full && pinsOpen)
    root.remove_css_class("clipboard-mode-full")
    root.remove_css_class("clipboard-mode-compact")
    root.add_css_class(full ? "clipboard-mode-full" : "clipboard-mode-compact")
    root.remove_css_class("clipboard-pins-open")
    if (full && pinsOpen) root.add_css_class("clipboard-pins-open")
    applyWindowLayout()
    refreshSettings()
  }

  // ── keyboard ─────────────────────────────────────────────────────────────

  function onKey(keyval: number, state: Gdk.ModifierType): boolean {
    const control = (state & Gdk.ModifierType.CONTROL_MASK) !== 0
    const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0
    const list = activeList()
    const typing = search.has_focus

    if (keyval === Gdk.KEY_Escape) {
      if (settingsOpen()) {
        fullGear.set_active(false)
        compactGear.set_active(false)
        return true
      }
      if (pinsOpen) {
        closePins()
        return true
      }
      if (clearConfirm) {
        clearConfirm = false
        renderCompact()
        return true
      }
      if (mode === "compact" && typing) {
        overlay?.set_focus(null)
        return true
      }
      hideWindow()
      return true
    }

    if (mode === "compact" && keyval === Gdk.KEY_Tab && !settingsOpen() && !clearConfirm) {
      if (shift) toggleCompactView()
      else toggleCompactView()
      return true
    }

    if (
      mode === "compact" &&
      !compactIsVertical(compactAlign) &&
      (keyval === Gdk.KEY_Up || keyval === Gdk.KEY_Down) &&
      !settingsOpen() &&
      !clearConfirm
    ) {
      toggleCompactView()
      return true
    }

    if (typing) {
      if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
        const item = selectedItem()
        if (item !== null) copyOnly(item)
        return true
      }
      if (keyval === Gdk.KEY_Delete) {
        deleteSelected()
        return true
      }
      return false
    }

    if (keyval === Gdk.KEY_slash && mode === "compact") {
      search.grab_focus()
      search.select_region(0, -1)
      return true
    }

    if (control && (keyval === Gdk.KEY_f || keyval === Gdk.KEY_F)) {
      const item = selectedItem()
      if (item !== null) togglePin(item)
      return true
    }
    if (control && (keyval === Gdk.KEY_z || keyval === Gdk.KEY_Z)) {
      undoDelete()
      return true
    }
    if (control) {
      const index = keyval - Gdk.KEY_1
      if (index >= 0 && index <= 8 && index < list.length) {
        const item = list[index]
        if (mode === "full") copyAndCollapse(item)
        else copyOnly(item)
        return true
      }
    }

    if (pinsOpen) {
      if (keyval === Gdk.KEY_Left) {
        movePins(-1)
        return true
      }
      if (keyval === Gdk.KEY_Right) {
        movePins(1)
        return true
      }
      if (keyval === Gdk.KEY_Down || keyval === Gdk.KEY_Up) {
        closePins()
        return true
      }
      if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
        copyFocusedPin()
        return true
      }
      return true
    }

    if (mode === "full") {
      if (keyval === Gdk.KEY_Up) {
        openPins()
        return true
      }
      if (keyval === Gdk.KEY_Down) return true
      if (keyval === Gdk.KEY_Left) {
        if (list.length < 2) return true
        const index = list.findIndex((item) => itemKey(item) === selectedKey)
        selectByKey(itemKey(list[(index - 1 + list.length) % list.length]))
        return true
      }
      if (keyval === Gdk.KEY_Right) {
        if (list.length < 2) return true
        const index = list.findIndex((item) => itemKey(item) === selectedKey)
        selectByKey(itemKey(list[(index + 1) % list.length]))
        return true
      }
    } else if (compactIsVertical(compactAlign)) {
      if (keyval === Gdk.KEY_Up) {
        selectByKey(moveCompactSelection(list, selectedKey, -1), true)
        return true
      }
      if (keyval === Gdk.KEY_Down) {
        selectByKey(moveCompactSelection(list, selectedKey, 1), true)
        return true
      }
      if (
        (keyval === Gdk.KEY_Left || keyval === Gdk.KEY_Right) &&
        !settingsOpen() &&
        !clearConfirm
      ) {
        toggleCompactView()
        return true
      }
    } else {
      if (keyval === Gdk.KEY_Left) {
        selectByKey(moveCompactSelection(list, selectedKey, -1), true)
        return true
      }
      if (keyval === Gdk.KEY_Right) {
        selectByKey(moveCompactSelection(list, selectedKey, 1), true)
        return true
      }
    }

    if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
      const item = selectedItem()
      if (item !== null) {
        if (mode === "full") copyAndCollapse(item)
        else copyOnly(item)
      }
      return true
    }
    if (keyval === Gdk.KEY_Delete) {
      deleteSelected()
      return true
    }
    return false
  }

  // ── event wiring ─────────────────────────────────────────────────────────

  function rebuildSearchIcon(): void {
    const next = uiIcon("search", 18)
    searchBox.remove(searchIcon)
    searchBox.prepend(next)
    searchIcon = next
  }

  prevArrow.connect("clicked", () => {
    const list = deck()
    if (list.length < 2) return
    const index = list.findIndex((item) => itemKey(item) === selectedKey)
    selectByKey(itemKey(list[(index - 1 + list.length) % list.length]))
  })
  nextArrow.connect("clicked", () => {
    const list = deck()
    if (list.length < 2) return
    const index = list.findIndex((item) => itemKey(item) === selectedKey)
    selectByKey(itemKey(list[(index + 1) % list.length]))
  })
  pinsPill.connect("clicked", () => {
    if (pinsOpen) closePins()
    else openPins()
  })
  pinsBack.connect("clicked", closePins)

  copyButton.connect("clicked", () => {
    const item = selectedItem()
    if (item !== null) copyAndCollapse(item)
  })
  pinButton.connect("clicked", () => {
    const item = selectedItem()
    if (item !== null) togglePin(item)
  })
  deleteButton.connect("clicked", deleteSelected)
  openButton.connect("clicked", () => {
    const item = selectedItem()
    if (item !== null) openLink(item)
  })

  search.connect("changed", () => {
    query = search.get_text()
    ensureSelection()
    renderCompact()
  })
  search.connect("notify::has-focus", () => {
    compactHints.set_label(compactHintText())
  })

  recentTab.connect("clicked", () => setView("recent"))
  pinnedTab.connect("clicked", () => setView("pinned"))
  newBadge.connect("clicked", jumpToNewest)
  stripPrev.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, -1), true))
  stripNext.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, 1), true))
  stripUp.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, -1), true))
  stripDown.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, 1), true))

  incognito.connect("clicked", () => {
    if (jobId === null) return
    domainEvents.control(jobId, paused ? "resume" : "pause")
  })
  clearButton.connect("clicked", () => {
    clearConfirm = true
    renderCompact()
  })
  clearNo.connect("clicked", () => {
    clearConfirm = false
    renderCompact()
  })
  clearYes.connect("clicked", () => {
    clearHistory()
    clearConfirm = false
    items = readHistory()
    selectedKey = null
    newKeys = []
    undo = null
    renderAll()
  })

  // Live updates: the daemon pushes clipboard.update per capture and
  // clipboard.state on transitions (subscribe-before-read; the platform's
  // event client owns the hydration state machine).
  domainEvents.subscribe("clipboard.update", (_topic: string, payload: DomainPayload) => {
    const item = itemFromPayload(payload as unknown as ClipboardUpdatePayload)
    const key = itemKey(item)
    items = [item, ...items.filter((existing) => itemKey(existing) !== key)]
    if (selectedKey === null) selectedKey = key
    if (!newKeys.includes(key)) newKeys = [key, ...newKeys]
    if (mapped) {
      if (mode === "full") {
        renderFull()
        if (pinsOpen) renderPins()
      } else {
        renderCompact()
      }
    }
  })
  domainEvents.subscribe("clipboard.state", (_topic: string, payload: DomainPayload) => {
    paused = payload.state === "paused"
    jobId = typeof payload.job_id === "string" && payload.job_id.length > 0 ? payload.job_id : null
    if (mapped) renderCompact()
  })
  domainEvents.onRestart(() => {
    items = readHistory()
    ensureSelection()
    if (mapped) renderAll()
  })

  // The surface the app-level appearance-refresh handler drives. `renderAll`
  // rebuilds the visible cards (no short-circuit), because the old cards hold
  // textures from the previous palette. It keeps `items`, `query`, selection,
  // `paused` and `jobId`.
  appearanceSurfaces.push({
    clearCaches: clearVisualCaches,
    rebuildSearchIcon,
    rebuildCards: renderAll,
  })

  // ── initial state ────────────────────────────────────────────────────────

  items = readHistory()
  ensureSelection()
  applyMode()
  renderAll()

  const initialAnchor =
    mode === "full"
      ? Astal.WindowAnchor.TOP |
        Astal.WindowAnchor.BOTTOM |
        Astal.WindowAnchor.LEFT |
        Astal.WindowAnchor.RIGHT
      : compactAlign === "left"
        ? Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT
        : compactAlign === "right"
          ? Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT
          : Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT
  const initialMargins =
    mode === "full"
      ? { top: 0, bottom: 0, left: 0, right: 0 }
      : compactAlign === "bottom"
        ? { top: 0, bottom: 12, left: 12, right: 12 }
        : { top: 52, bottom: 12, left: 12, right: 12 }

  return (
    <window
      visible={false}
      name={WINDOW_NAME}
      class="clipboard-window"
      gdkmonitor={gdkmonitor}
      anchor={initialAnchor}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      margin_top={initialMargins.top}
      margin_bottom={initialMargins.bottom}
      margin_left={initialMargins.left}
      margin_right={initialMargins.right}
      $={(self) => {
        overlay = self
        applyWindowLayout()
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
          self.present()
          if (mode === "compact") search.grab_focus()
          items = readHistory()
          ensureSelection()
          renderAll()
        })
        self.connect("unmap", () => {
          mapped = false
        })
      }}
    >
      <box
        orientation={Gtk.Orientation.VERTICAL}
        $={(self) => {
          self.append(root)
        }}
      />
    </window>
  )
}
