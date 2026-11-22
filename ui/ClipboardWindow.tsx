import { Astal, Gdk, Gtk } from "ags/gtk4"
import app from "ags/gtk4/app"
import cairo from "gi://cairo?version=1.0"
import GLib from "gi://GLib?version=2.0"
// The one domain-event client (spine AD-5): the app consumes the platform's
// shared client instead of a local event-bus copy. Topics are the contract
// names, passed as literals exactly as the bar does for `capture.state`.
import { domainEvents, type DomainPayload } from "ags-platform/adapters/event-bus"
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
  filterItems,
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
  PeekCard,
  PinCard,
  StageCard,
  TYPE_LABEL,
  clearVisualCaches,
  relativeTime,
  uiIcon,
} from "./ItemCard"
import { installContentAccents } from "./content-accent"

export const WINDOW_NAME = "clipboard-window"

const FILTER_LABEL: Record<TypeFilter, string> = {
  all: "All",
  text: "Text",
  link: "Links",
  code: "Code",
  image: "Images",
  color: "Colors",
  emoji: "Emoji",
}

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

function keycap(text: string): Gtk.Label {
  const widget = new Gtk.Label({ label: text })
  widget.add_css_class("clipboard-keycap")
  widget.set_valign(Gtk.Align.CENTER)
  return widget
}

interface ComposedButton {
  button: Gtk.Button
  label: Gtk.Label
  iconHost: Gtk.Box
  setIcon(variant: string): void
}

/**
 * A button whose child is [icon host][label], so the icon can be replaced from
 * the current palette without recreating the button (and the label stays
 * available for live text changes such as Incognito on/off).
 */
function iconTextButton(
  text: string,
  cssClass: string | undefined,
  iconVariant: string | null,
): ComposedButton {
  const widget = new Gtk.Button()
  if (cssClass !== undefined) widget.add_css_class(cssClass)
  const content = row(6)
  content.add_css_class("clipboard-button-content")
  const iconHost = new Gtk.Box()
  iconHost.set_valign(Gtk.Align.CENTER)
  const label = new Gtk.Label({ label: text })
  label.add_css_class("clipboard-button-label")
  content.append(iconHost)
  content.append(label)
  widget.set_child(content)
  widget.set_tooltip_text(text)
  const composed: ComposedButton = {
    button: widget,
    label,
    iconHost,
    setIcon(variant: string) {
      clearChildren(iconHost)
      iconHost.append(uiIcon(variant, 12))
    },
  }
  if (iconVariant !== null) composed.setIcon(iconVariant)
  return composed
}

interface BarButton {
  button: Gtk.Button
  label: Gtk.Label
  setIcon(variant: string): void
}

/** One full-mode control-bar button: icon + label + optional keycap. */
function barButton(
  text: string,
  iconVariant: string | null,
  key: string | null,
  cssClass?: string,
): BarButton {
  const widget = new Gtk.Button()
  widget.add_css_class("clipboard-bar-button")
  if (cssClass !== undefined) widget.add_css_class(cssClass)
  const content = row(5)
  content.add_css_class("clipboard-button-content")
  const iconHost = new Gtk.Box()
  iconHost.set_valign(Gtk.Align.CENTER)
  const label = new Gtk.Label({ label: text })
  label.add_css_class("clipboard-button-label")
  content.append(iconHost)
  content.append(label)
  if (key !== null) content.append(keycap(key))
  widget.set_child(content)
  widget.set_tooltip_text(text)
  return {
    button: widget,
    label,
    setIcon(variant: string) {
      clearChildren(iconHost)
      iconHost.append(uiIcon(variant, 13))
    },
  }
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
  cardWidth: number,
  settingsPort: SettingsPort = createGlibSettingsPort(),
) {
  installContentAccents()
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
  //: Delete undo buffer + the timeout that retires it.
  let undo: { item: ClipboardItem; selected: string | null } | null = null
  let undoTimer = 0
  //: Whether the surface is mapped; capture updates while hidden just refresh
  //: the in-memory list and rebuild lazily on the next show.
  let mapped = false
  let overlay: Astal.Window | null = null
  let settingsPanelWidget: Gtk.Box | null = null
  let settingsPanelOpen = false
  //: Rendered compact cards by stable key, for incremental selection.
  const compactCards = new Map<string, Gtk.Widget>()

  // ── persistent widgets ───────────────────────────────────────────────────

  const root = new Gtk.Overlay()
  root.add_css_class("clipboard-root")
  root.set_vexpand(true)
  root.set_hexpand(true)
  // A focusable, paint-free root is the compact default focus target. This
  // keeps the entry unfocused (so arrows navigate cards) while the window
  // still owns the keyboard.
  root.set_can_focus(true)
  const stageBase = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
  stageBase.set_vexpand(true)
  stageBase.set_hexpand(true)

  // Full stage
  const fullRoot = column(10)
  fullRoot.add_css_class("clipboard-full")
  fullRoot.set_vexpand(true)
  fullRoot.set_hexpand(true)

  const brand = label("Clipboard", "clipboard-brand")
  const fullCount = label("0", "clipboard-count")
  const pinsPill = button("Pinned (0)", "clipboard-pins-pill")
  const fullGear = new Gtk.Button({ css_classes: ["clipboard-gear"] })
  fullGear.set_child(uiIcon("settings", 18))
  fullGear.set_size_request(38, 38)
  fullGear.set_tooltip_text("Settings")

  function makeFilterChip(value: TypeFilter): Gtk.Button {
    const chip = new Gtk.Button()
    chip.add_css_class("clipboard-chip")
    const content = row(6)
    content.add_css_class("clipboard-chip-content")
    if (value !== "all") {
      const dot = new Gtk.Box()
      dot.add_css_class("clipboard-filter-dot")
      dot.add_css_class(`kind-${value}`)
      dot.set_size_request(6, 6)
      dot.set_halign(Gtk.Align.CENTER)
      dot.set_valign(Gtk.Align.CENTER)
      content.append(dot)
    }
    content.append(label(FILTER_LABEL[value], "clipboard-chip-label"))
    chip.set_child(content)
    chip.set_tooltip_text(`Filter ${FILTER_LABEL[value]}`)
    chip.connect("clicked", () => applyFilter(value))
    return chip
  }

  const fullFilterChips = new Map<TypeFilter, Gtk.Button>()
  const fullFilters = new Gtk.FlowBox({
    selection_mode: Gtk.SelectionMode.NONE,
    row_spacing: 4,
    column_spacing: 4,
    max_children_per_line: 7,
  })
  fullFilters.add_css_class("clipboard-filters")
  fullFilters.set_hexpand(false)
  for (const value of TYPE_FILTERS) {
    const chip = makeFilterChip(value)
    fullFilters.append(chip)
    fullFilterChips.set(value, chip)
  }

  const fullSearch = new Gtk.Entry({
    placeholder_text: "Search clipboard\u2026",
    hexpand: true,
  })
  fullSearch.add_css_class("clipboard-search")
  const fullSearchBox = row(8)
  fullSearchBox.add_css_class("clipboard-search-box")
  fullSearchBox.append(uiIcon("search", 18))
  fullSearchBox.append(fullSearch)
  fullSearchBox.append(keycap("/"))

  const fullTop = row(10)
  fullTop.add_css_class("clipboard-full-top")
  const fullTopSpacer = new Gtk.Box()
  fullTopSpacer.set_hexpand(true)
  fullTop.append(brand)
  fullTop.append(fullCount)
  fullTop.append(fullTopSpacer)
  fullTop.append(pinsPill)
  fullTop.append(fullSearchBox)
  fullTop.append(fullFilters)
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
  const copyBar = barButton("Copy", "copy", "\u21b5", "primary")
  const pinBar = barButton("Pin", "pin", "Ctrl+F")
  const deleteBar = barButton("Delete", "trash", "Del", "danger")
  const openBar = barButton("Open", "external", null)
  const fullClearBar = barButton("Clear", "trash", null, "danger")
  const copyButton = copyBar.button
  const pinButton = pinBar.button
  const deleteButton = deleteBar.button
  const openButton = openBar.button
  const fullClearButton = fullClearBar.button
  const fullClearYes = button("Clear", "clipboard-confirm-yes")
  const fullClearNo = button("Cancel", "clipboard-confirm-no")
  const fullClearConfirmBox = row(4)
  fullClearConfirmBox.add_css_class("clipboard-clear-confirm")
  fullClearConfirmBox.append(label("Clear all?", "clipboard-confirm-label"))
  fullClearConfirmBox.append(fullClearNo)
  fullClearConfirmBox.append(fullClearYes)
  fullClearConfirmBox.set_visible(false)
  const fullHints = label("\u2190 \u2192 cards \u00b7 \u2191 pinned \u00b7 \u2193 back", "clipboard-hints")
  const controlBar = row(6)
  controlBar.add_css_class("clipboard-control-bar")
  const barActions = row(6)
  barActions.append(copyButton)
  barActions.append(pinButton)
  barActions.append(deleteButton)
  barActions.append(fullClearButton)
  barActions.append(fullClearConfirmBox)
  barActions.append(openButton)
  const barSpacer = new Gtk.Box()
  barSpacer.set_hexpand(true)
  controlBar.append(barMeta)
  controlBar.append(barSpacer)
  controlBar.append(barActions)
  controlBar.append(fullHints)

  const pinsTitle = label("Pinned \u00b7 0", "clipboard-pins-title")
  const pinsHints = label("\u2190 \u2192 select \u00b7 \u21b5 copy \u00b7 \u2193 back", "clipboard-hints")
  const pinsHint = label("Click a card to copy it", "clipboard-pins-hint")
  const pinsBackBar = barButton("Back", "down", "Esc")
  const pinsBack = pinsBackBar.button
  const pinsHead = row(12)
  pinsHead.add_css_class("clipboard-pins-head")
  pinsHead.append(pinsTitle)
  pinsHead.append(pinsBack)
  pinsHead.append(pinsHints)
  const pinsSpacer = new Gtk.Box()
  pinsSpacer.set_hexpand(true)
  pinsHead.append(pinsSpacer)
  pinsHead.append(pinsHint)
  const pinsGrid = new Gtk.Grid({
    column_spacing: 16,
    row_spacing: 16,
    column_homogeneous: true,
  })
  pinsGrid.add_css_class("clipboard-pins-grid")
  pinsGrid.set_hexpand(true)
  pinsGrid.set_halign(Gtk.Align.FILL)
  pinsGrid.set_valign(Gtk.Align.START)
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

  const compactSpacer = new Gtk.Box()
  compactSpacer.set_vexpand(true)
  compactSpacer.set_visible(false)

  const settingsCatcher = new Gtk.Box()
  settingsCatcher.add_css_class("clipboard-settings-catcher")
  settingsCatcher.set_hexpand(true)
  settingsCatcher.set_vexpand(true)
  settingsCatcher.set_visible(false)
  const settingsCatcherClick = new Gtk.GestureClick()
  settingsCatcherClick.connect("pressed", () => closeSettings())
  settingsCatcher.add_controller(settingsCatcherClick)

  const fullBody = column(10)
  fullBody.set_vexpand(true)
  fullBody.append(stageArea)
  fullBody.append(controlBar)
  fullRoot.append(fullTop)
  fullRoot.append(fullBody)

  // Compact strip
  const compactRoot = column(10)
  compactRoot.add_css_class("clipboard-compact")
  compactRoot.set_vexpand(false)
  compactRoot.set_hexpand(true)

  let searchIcon = uiIcon("search", 18)
  const search = new Gtk.Entry({ placeholder_text: "Search clipboard\u2026", hexpand: true })
  search.add_css_class("clipboard-search")
  const searchBox = row(8)
  searchBox.add_css_class("clipboard-search-box")
  searchBox.append(searchIcon)
  searchBox.append(search)
  searchBox.append(keycap("/"))

  const filterChips = new Map<TypeFilter, Gtk.Button>()
  const filters = new Gtk.FlowBox({
    selection_mode: Gtk.SelectionMode.NONE,
    row_spacing: 4,
    column_spacing: 4,
    max_children_per_line: 8,
  })
  filters.add_css_class("clipboard-filters")
  filters.set_hexpand(true)
  for (const value of TYPE_FILTERS) {
    const chip = makeFilterChip(value)
    filters.append(chip)
    filterChips.set(value, chip)
  }

  const incognito = iconTextButton("Incognito: off", "clipboard-incognito", "pause")
  const clear = iconTextButton("Clear", "clipboard-clear", "trash")
  const clearButton = clear.button
  const clearYes = button("Clear", "clipboard-confirm-yes")
  const clearNo = button("Cancel", "clipboard-confirm-no")
  const clearConfirmBox = row(4)
  clearConfirmBox.add_css_class("clipboard-clear-confirm")
  clearConfirmBox.append(label("Clear all?", "clipboard-confirm-label"))
  clearConfirmBox.append(clearNo)
  clearConfirmBox.append(clearYes)
  const compactGear = new Gtk.Button({ css_classes: ["clipboard-gear"] })
  compactGear.set_child(uiIcon("settings", 18))
  compactGear.set_size_request(38, 38)
  compactGear.set_tooltip_text("Settings")
  const compactActions = row(6)
  compactActions.add_css_class("clipboard-compact-actions")
  compactActions.append(incognito.button)
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
  const viewBar = row(2)
  viewBar.add_css_class("clipboard-viewbar")
  viewBar.append(recentTab)
  viewBar.append(pinnedTab)

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
  for (const arrow of [prevArrow, nextArrow]) {
    arrow.set_size_request(46, 46)
    arrow.set_hexpand(false)
    arrow.set_vexpand(false)
    arrow.set_halign(Gtk.Align.CENTER)
    arrow.set_valign(Gtk.Align.CENTER)
  }
  for (const arrow of [stripPrev, stripNext, stripUp, stripDown]) {
    arrow.set_size_request(32, 32)
    arrow.set_hexpand(false)
    arrow.set_vexpand(false)
    arrow.set_halign(Gtk.Align.CENTER)
    arrow.set_valign(Gtk.Align.CENTER)
  }
  compactRoot.append(compactTop)
  compactRoot.append(viewBar)
  compactRoot.append(strip)
  compactRoot.append(compactHints)

  stageBase.append(fullRoot)
  stageBase.append(compactSpacer)
  stageBase.append(compactRoot)
  root.set_child(stageBase)
  pinsPanel.set_hexpand(true)
  pinsPanel.set_halign(Gtk.Align.FILL)
  pinsPanel.set_valign(Gtk.Align.FILL)
  root.add_overlay(pinsPanel)
  root.add_overlay(settingsCatcher)

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

  function settingsRow(
    title: string,
    description: string,
    segment: Segment<string>,
  ): Gtk.Box {
    const wrapper = row(12)
    wrapper.add_css_class("clipboard-setting-row")
    const text = column(2)
    text.set_hexpand(true)
    text.append(label(title, "clipboard-setting-label"))
    text.append(label(description, "clipboard-setting-desc"))
    wrapper.append(text)
    wrapper.append(segment.widget)
    return wrapper
  }

  function buildSettingsPanel(): Gtk.Box {
    const content = column(0)
    content.add_css_class("clipboard-settings")
    content.set_size_request(342, -1)

    const head = row(8)
    head.add_css_class("clipboard-settings-head")
    head.append(label("Settings", "clipboard-settings-title"))
    head.append(label("Layout", "clipboard-settings-sub"))
    content.append(head)

    const layoutSeg = segmented<LayoutMode>(
      [
        { value: "full", label: "Full" },
        { value: "compact", label: "Compact" },
      ],
      () => mode,
      setMode,
      () => true,
    )
    const layoutRow = settingsRow(
      "Layout",
      "Full stage or compact strip.",
      layoutSeg,
    )

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
    const sizeRow = settingsRow("Compact card size", "220 / 260 / 300 px.", sizeSeg)

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
    const alignRow = settingsRow(
      "Compact alignment",
      "Bottom strip, or a full-height side column.",
      alignSeg,
    )

    content.append(layoutRow)
    content.append(sizeRow)
    content.append(alignRow)

    settingsRefreshers.push(() => {
      layoutSeg.refresh()
      sizeSeg.refresh()
      alignSeg.refresh()
      for (const target of [sizeRow, alignRow]) {
        if (mode === "compact") target.remove_css_class("disabled")
        else target.add_css_class("disabled")
      }
    })
    return content
  }

  settingsPanelWidget = buildSettingsPanel()
  settingsPanelWidget.set_halign(Gtk.Align.END)
  settingsPanelWidget.set_valign(Gtk.Align.START)
  settingsPanelWidget.set_visible(false)
  root.add_overlay(settingsPanelWidget)

  function settingsOpen(): boolean {
    return settingsPanelOpen
  }

  function closeSettings(): void {
    if (!settingsPanelOpen) return
    settingsPanelOpen = false
    settingsCatcher.set_visible(false)
    settingsPanelWidget?.set_visible(false)
    applyMode()
  }

  function openSettings(): void {
    if (settingsPanelOpen) return
    settingsPanelOpen = true
    settingsCatcher.set_visible(true)
    settingsPanelWidget?.set_visible(true)
    applyMode()
  }

  function toggleSettings(): void {
    if (settingsPanelOpen) closeSettings()
    else openSettings()
  }

  fullGear.connect("clicked", toggleSettings)
  compactGear.connect("clicked", toggleSettings)

  // ── list + selection helpers ─────────────────────────────────────────────

  function deck(): ClipboardItem[] {
    return ordered(items)
  }

  function fullList(): ClipboardItem[] {
    return filterItems(items, query, filter)
  }

  function compactListItems(): ClipboardItem[] {
    return filterCompactView(items, query, filter, compactView)
  }

  function syncFilterChips(): void {
    for (const [value, chip] of fullFilterChips) {
      if (value === filter) chip.add_css_class("selected")
      else chip.remove_css_class("selected")
    }
    for (const [value, chip] of filterChips) {
      if (value === filter) chip.add_css_class("selected")
      else chip.remove_css_class("selected")
    }
  }

  function applyFilter(value: TypeFilter): void {
    filter = value
    syncFilterChips()
    ensureSelection()
    if (mode === "full") renderFull()
    else renderCompact()
  }

  let syncingSearch = false

  function setSearchQuery(text: string, source: Gtk.Entry): void {
    if (syncingSearch) return
    syncingSearch = true
    query = text
    for (const entry of [search, fullSearch]) {
      if (entry !== source && entry.get_text() !== text) entry.set_text(text)
    }
    syncingSearch = false
    ensureSelection()
    if (mode === "full") renderFull()
    else renderCompact()
  }

  function bindSearchFocus(entry: Gtk.Entry, box: Gtk.Box): void {
    entry.connect("notify::has-focus", () => {
      if (entry.has_focus) box.add_css_class("focused")
      else box.remove_css_class("focused")
      if (entry === search) compactHints.set_label(compactHintText())
    })
  }

  function activeList(): ClipboardItem[] {
    return mode === "full" ? fullList() : compactListItems()
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

  function selectCompactKey(key: string, scroll: boolean): boolean {
    const next = compactCards.get(key)
    if (next === undefined) return false
    const previous = selectedKey === null ? undefined : compactCards.get(selectedKey)
    previous?.remove_css_class("selected")
    next.add_css_class("selected")
    selectedKey = key
    if (scroll) scrollSelectedIntoView()
    return true
  }

  function selectByKey(key: string | null, scroll = false): void {
    if (key === null) return
    if (mode === "full") {
      selectedKey = key
      renderFull()
      if (pinsOpen) renderPins()
      if (scroll) scrollSelectedIntoView()
      return
    }
    if (selectCompactKey(key, scroll)) return
    // The key is not in the current rendered view (filtered out); rebuild.
    selectedKey = key
    renderCompact()
    if (scroll) scrollSelectedIntoView()
  }

  function scrollSelectedIntoView(): void {
    if (mode !== "compact") return
    const card = selectedKey === null ? undefined : compactCards.get(selectedKey)
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
    copyItem(item).catch((error: unknown) =>
      console.error(`clipboard: copy failed: ${error}`),
    )
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

  function askClear(): void {
    clearConfirm = true
    renderAll()
  }

  function cancelClear(): void {
    clearConfirm = false
    renderAll()
  }

  function performClear(): void {
    clearHistory()
    clearConfirm = false
    items = readHistory()
    selectedKey = null
    undo = null
    renderAll()
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

  // ── rendering ────────────────────────────────────────────────────────────

  function compactWidth(): number {
    return compactSize === "medium" ? cardWidth : compactCardWidth(compactSize)
  }

  function stageSize(): { width: number; height: number } {
    return {
      width: Math.max(420, Math.min(720, geometry.width - 240)),
      height: Math.max(340, Math.min(460, geometry.height - 220)),
    }
  }

  function renderFull(): void {
    const list = fullList()
    ensureSelection()
    syncFilterChips()
    const pins = pinnedOrdered(items)
    fullCount.set_label(String(items.length))
    pinsPill.set_label(`Pinned (${pins.length})`)
    if (pins.length === 0) pinsPill.add_css_class("empty")
    else pinsPill.remove_css_class("empty")

    const { width, height } = stageSize()
    clearChildren(stageSlot)
    clearChildren(prevPeek)
    clearChildren(nextPeek)

    fullClearButton.set_visible(!clearConfirm)
    fullClearConfirmBox.set_visible(clearConfirm)
    fullClearButton.set_sensitive(items.length > 0)

    if (list.length === 0) {
      const empty = column(6)
      empty.add_css_class("clipboard-stage-empty")
      empty.set_valign(Gtk.Align.CENTER)
      empty.set_halign(Gtk.Align.CENTER)
      const noHistory = items.length === 0
      empty.append(
        label(
          noHistory ? "Clipboard is empty" : "No matching cards",
          "clipboard-empty-title",
        ),
      )
      empty.append(
        label(
          noHistory
            ? "Copy something and it will appear here."
            : "Try another search or filter.",
          "clipboard-empty-detail",
        ),
      )
      stageSlot.append(empty)
      prevArrow.set_sensitive(false)
      nextArrow.set_sensitive(false)
      barIndex.set_label("0 / 0")
      barType.set_label(noHistory ? "No cards" : "No matches")
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
    stageSlot.append(StageCard(item, copyAndCollapse, openLink, width, height, togglePin))
    const prev = list[(index - 1 + list.length) % list.length]
    const next = list[(index + 1) % list.length]
    prevPeek.append(PeekCard(list.length > 1 ? prev : null, (target) => selectByKey(itemKey(target)), 152, Math.round(height * 0.72), togglePin))
    nextPeek.append(PeekCard(list.length > 1 ? next : null, (target) => selectByKey(itemKey(target)), 152, Math.round(height * 0.72), togglePin))
    prevArrow.set_sensitive(list.length > 1)
    nextArrow.set_sensitive(list.length > 1)

    barIndex.set_label(`${index + 1} / ${list.length}`)
    barType.set_label(
      `${TYPE_LABEL[item.kind]} \u00b7 ${relativeTime(item.timestamp)}${item.favorite ? " \u00b7 pinned" : ""}`,
    )
    copyButton.set_sensitive(true)
    pinButton.set_sensitive(true)
    copyBar.setIcon("copy")
    pinBar.setIcon("pin")
    deleteBar.setIcon("trash")
    openBar.setIcon("external")
    pinBar.label.set_label(item.favorite ? "Unpin" : "Pin")
    pinButton.set_tooltip_text(item.favorite ? "Unpin card" : "Pin card")
    if (item.favorite) pinButton.add_css_class("is-on")
    else pinButton.remove_css_class("is-on")
    deleteButton.set_sensitive(true)
    openButton.set_visible(item.kind === "link")
    openButton.set_sensitive(item.kind === "link")
    fullHints.set_label("\u2190 \u2192 cards \u00b7 \u2191 pinned \u00b7 \u21b5 copy+close \u00b7 Ctrl+\u21b5 open \u00b7 \u2193 back")
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
    const cardW = Math.max(180, Math.floor((geometry.width - 96) / 4))
    const columns = 4
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
        togglePin,
      )
      pinsGrid.attach(card, index % columns, Math.floor(index / columns), 1, 1)
    })
    // Keep four equal columns even when the last row is not full. Without
    // fillers a 3-pin grid would collapse to 3 wider columns, unlike the mock.
    const rows = Math.ceil(pins.length / columns)
    for (let index = pins.length; index < rows * columns; index += 1) {
      const filler = new Gtk.Box()
      filler.add_css_class("clipboard-pin-filler")
      filler.set_hexpand(true)
      pinsGrid.attach(filler, index % columns, Math.floor(index / columns), 1, 1)
    }
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

  function applyCompactShell(): void {
    const activeCompact = mode === "compact"
    const vertical = activeCompact && compactIsVertical(compactAlign)
    compactSpacer.set_visible(activeCompact && !vertical)
    compactRoot.set_margin_top(0)
    compactRoot.set_margin_bottom(0)
    compactRoot.set_margin_start(0)
    compactRoot.set_margin_end(0)
    if (vertical) {
      compactRoot.set_vexpand(true)
      compactRoot.set_valign(Gtk.Align.FILL)
      compactRoot.set_halign(
        compactAlign === "left" ? Gtk.Align.START : Gtk.Align.END,
      )
      compactRoot.set_hexpand(false)
      compactRoot.set_margin_top(52)
      compactRoot.set_margin_bottom(12)
      if (compactAlign === "left") compactRoot.set_margin_start(12)
      else compactRoot.set_margin_end(12)
    } else {
      compactRoot.set_vexpand(false)
      compactRoot.set_valign(Gtk.Align.END)
      compactRoot.set_halign(Gtk.Align.FILL)
      compactRoot.set_hexpand(true)
      compactRoot.set_margin_start(12)
      compactRoot.set_margin_end(12)
      compactRoot.set_margin_bottom(12)
    }
    compactRoot.set_size_request(vertical ? compactWidth() : -1, -1)
    compactRoot.remove_css_class("align-bottom")
    compactRoot.remove_css_class("align-left")
    compactRoot.remove_css_class("align-right")
    compactRoot.add_css_class(`align-${compactAlign}`)

    searchBox.set_size_request(vertical ? compactWidth() : -1, -1)
    filters.set_max_children_per_line(vertical ? 3 : 8)
    compactList.set_orientation(
      vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
    )
    compactList.set_halign(vertical ? Gtk.Align.FILL : Gtk.Align.START)
    compactList.set_hexpand(!vertical)
    strip.set_orientation(
      vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
    )
    compactTop.set_orientation(
      vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
    )
    compactScroll.set_policy(
      vertical ? Gtk.PolicyType.NEVER : Gtk.PolicyType.AUTOMATIC,
      vertical ? Gtk.PolicyType.AUTOMATIC : Gtk.PolicyType.NEVER,
    )
    stripPrev.set_visible(!vertical)
    stripNext.set_visible(!vertical)
    stripUp.set_visible(vertical)
    stripDown.set_visible(vertical)
    scheduleInputRegion()
  }

  function renderCompact(): void {
    applyCompactShell()
    const pins = items.filter((item) => item.favorite).length
    if (compactView === "pinned" && pins === 0) {
      compactView = "recent"
      ensureSelection()
    }
    const list = compactListItems()
    const vertical = compactIsVertical(compactAlign)

    syncFilterChips()

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

    incognito.label.set_label(paused ? "Incognito: on" : "Incognito: off")
    incognito.button.set_tooltip_text(paused ? "Resume clipboard captures" : "Pause clipboard captures")
    incognito.setIcon(paused ? "play" : "pause")
    if (paused) incognito.button.add_css_class("is-on")
    else incognito.button.remove_css_class("is-on")
    clear.setIcon("trash")
    clearButton.set_visible(!clearConfirm)
    clearConfirmBox.set_visible(clearConfirm)

    compactHints.set_label(compactHintText())

    clearChildren(compactList)
    compactCards.clear()
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
        togglePin,
      )
      if (vertical) card.set_halign(Gtk.Align.CENTER)
      card.add_css_class(`key-${cssKey(itemKey(item))}`)
      if (itemKey(item) === selectedKey) card.add_css_class("selected")
      compactCards.set(itemKey(item), card)
      compactList.append(card)
    })
    // Trailing spacer: absorbs any extra width so the fixed-width cards keep
    // their natural size instead of being stretched by the box. The vertical
    // column has no extra width to absorb.
    if (!vertical) {
      const spacer = new Gtk.Box()
      spacer.set_hexpand(true)
      compactList.append(spacer)
    }
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      scrollSelectedIntoView()
      return false
    })
  }

  function compactHintText(): string {
    const hasPins = items.some((item) => item.favorite)
    const typing = search.has_focus
    if (compactIsVertical(compactAlign)) {
      if (!hasPins) return "\u2191\u2193 cards \u00b7 \u21b5 copy+close \u00b7 Ctrl+\u21b5 open"
      return typing
        ? "\u2191\u2193 cards \u00b7 Tab view"
        : "\u2191\u2193 cards \u00b7 \u2190\u2192 view \u00b7 Tab view \u00b7 Ctrl+\u21b5 open"
    }
    if (!hasPins) return "\u2190 \u2192 cards \u00b7 \u21b5 copy+close \u00b7 Ctrl+\u21b5 open \u00b7 Esc"
    return "\u2190 \u2192 cards \u00b7 \u2191\u2193 view \u00b7 Tab view \u00b7 \u21b5 copy+close \u00b7 Esc"
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
    // The layer-shell surface is STABLE for every mode: full-monitor, zero
    // margins. Opening settings or switching compact alignment never
    // re-anchors/resizes it (that caused a compositor remap/flash).
    overlay.anchor = (
      Astal.WindowAnchor.TOP |
      Astal.WindowAnchor.BOTTOM |
      Astal.WindowAnchor.LEFT |
      Astal.WindowAnchor.RIGHT
    ) as Astal.WindowAnchor
    overlay.margin_top = 0
    overlay.margin_bottom = 0
    overlay.margin_left = 0
    overlay.margin_right = 0
  }

  let inputRegionPending = 0

  function applyInputRegion(): void {
    const surface = overlay?.get_surface()
    if (surface === null || surface === undefined) return
    if (mode === "full" || settingsPanelOpen) {
      surface.set_input_region(null)
      return
    }
    const width = compactRoot.get_width()
    const height = compactRoot.get_height()
    if (width <= 0 || height <= 0) return
    const allocation = compactRoot.get_allocation()
    // GJS exposes the cairo region from gi://cairo, while Gdk's typings import
    // the cairo module's Region. The runtime object is the same; cast at the
    // boundary.
    const region = new cairo.Region() as unknown as {
      unionRectangle(rect: { x: number; y: number; width: number; height: number }): void
    }
    region.unionRectangle(
      new cairo.Rectangle({
        x: allocation.x,
        y: allocation.y,
        width,
        height,
      }) as unknown as { x: number; y: number; width: number; height: number },
    )
    surface.set_input_region(
      region as unknown as Parameters<Gdk.Surface["set_input_region"]>[0],
    )
  }

  function scheduleInputRegion(): void {
    if (inputRegionPending !== 0) return
    inputRegionPending = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      inputRegionPending = 0
      applyInputRegion()
      return false
    })
  }

  function positionSettingsPanel(): void {
    if (settingsPanelWidget === null) return
    const panel = settingsPanelWidget
    panel.set_margin_top(0)
    panel.set_margin_bottom(0)
    panel.set_margin_start(0)
    panel.set_margin_end(0)
    if (mode === "full") {
      panel.set_halign(Gtk.Align.END)
      panel.set_valign(Gtk.Align.START)
      panel.set_margin_top(76)
      panel.set_margin_end(28)
      return
    }
    if (compactAlign === "bottom") {
      panel.set_halign(Gtk.Align.END)
      panel.set_valign(Gtk.Align.END)
      panel.set_margin_bottom(360)
      panel.set_margin_end(18)
    } else if (compactAlign === "left") {
      panel.set_halign(Gtk.Align.START)
      panel.set_valign(Gtk.Align.START)
      panel.set_margin_top(60)
      panel.set_margin_start(compactWidth() + 48)
    } else {
      panel.set_halign(Gtk.Align.END)
      panel.set_valign(Gtk.Align.START)
      panel.set_margin_top(60)
      panel.set_margin_end(compactWidth() + 48)
    }
  }

  function applyMode(): void {
    const full = mode === "full"
    // Keep the stage mounted behind the pinned grid (the panel is an
    // overlay child with its own scrim), matching the mock's pins-open look.
    fullRoot.set_visible(full)
    compactRoot.set_visible(!full)
    pinsPanel.set_visible(full && pinsOpen)
    if (full && pinsOpen) {
      pinsPanel.set_halign(Gtk.Align.FILL)
      pinsPanel.set_valign(Gtk.Align.FILL)
      pinsPanel.set_hexpand(true)
      pinsPanel.set_vexpand(true)
      pinsGrid.set_halign(Gtk.Align.FILL)
      pinsGrid.set_hexpand(true)
    }
    applyCompactShell()
    settingsCatcher.set_visible(settingsPanelOpen)
    settingsPanelWidget?.set_visible(settingsPanelOpen)
    root.remove_css_class("clipboard-mode-full")
    root.remove_css_class("clipboard-mode-compact")
    root.add_css_class(full ? "clipboard-mode-full" : "clipboard-mode-compact")
    root.remove_css_class("clipboard-pins-open")
    if (full && pinsOpen) root.add_css_class("clipboard-pins-open")
    root.remove_css_class("clipboard-settings-open")
    if (settingsPanelOpen) root.add_css_class("clipboard-settings-open")
    positionSettingsPanel()
    applyWindowLayout()
    refreshSettings()
  }

  // ── keyboard ─────────────────────────────────────────────────────────────

  function onKey(keyval: number, state: Gdk.ModifierType): boolean {
    const control = (state & Gdk.ModifierType.CONTROL_MASK) !== 0
    const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0
    const list = activeList()
    const typing = mode === "full" ? fullSearch.has_focus : search.has_focus

    if (keyval === Gdk.KEY_Escape) {
      if (settingsOpen()) {
        closeSettings()
        return true
      }
      if (pinsOpen) {
        closePins()
        return true
      }
      if (clearConfirm) {
        cancelClear()
        return true
      }
      if (typing) {
        root.grab_focus()
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

    if (control && (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter)) {
      const item = selectedItem()
      if (item !== null && item.kind === "link") openLink(item)
      return true
    }

    if (typing) {
      if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
        const item = selectedItem()
        if (item !== null) copyAndCollapse(item)
        return true
      }
      if (keyval === Gdk.KEY_Delete) {
        deleteSelected()
        return true
      }
      return false
    }

    if (keyval === Gdk.KEY_slash) {
      const entry = mode === "full" ? fullSearch : search
      entry.grab_focus()
      entry.select_region(0, -1)
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
      if (item !== null) copyAndCollapse(item)
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
    const list = fullList()
    if (list.length < 2) return
    const index = list.findIndex((item) => itemKey(item) === selectedKey)
    selectByKey(itemKey(list[(index - 1 + list.length) % list.length]))
  })
  nextArrow.connect("clicked", () => {
    const list = fullList()
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

  search.connect("changed", () => setSearchQuery(search.get_text(), search))
  fullSearch.connect("changed", () => setSearchQuery(fullSearch.get_text(), fullSearch))
  bindSearchFocus(search, searchBox)
  bindSearchFocus(fullSearch, fullSearchBox)

  recentTab.connect("clicked", () => setView("recent"))
  pinnedTab.connect("clicked", () => setView("pinned"))
  stripPrev.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, -1), true))
  stripNext.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, 1), true))
  stripUp.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, -1), true))
  stripDown.connect("clicked", () => selectByKey(moveCompactSelection(compactListItems(), selectedKey, 1), true))

  incognito.button.connect("clicked", () => {
    if (jobId === null) return
    domainEvents.control(jobId, paused ? "resume" : "pause")
  })
  fullClearButton.connect("clicked", askClear)
  fullClearNo.connect("clicked", cancelClear)
  fullClearYes.connect("clicked", performClear)
  clearButton.connect("clicked", askClear)
  clearNo.connect("clicked", cancelClear)
  clearYes.connect("clicked", performClear)

  // Live updates: the daemon pushes clipboard.update per capture and
  // clipboard.state on transitions (subscribe-before-read; the platform's
  // event client owns the hydration state machine).
  domainEvents.subscribe("clipboard.update", (_topic: string, payload: DomainPayload) => {
    const item = itemFromPayload(payload as unknown as ClipboardUpdatePayload)
    const key = itemKey(item)
    items = [item, ...items.filter((existing) => itemKey(existing) !== key)]
    if (selectedKey === null) selectedKey = key
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
    Astal.WindowAnchor.TOP |
    Astal.WindowAnchor.BOTTOM |
    Astal.WindowAnchor.LEFT |
    Astal.WindowAnchor.RIGHT

  return (
    <window
      visible={false}
      name={WINDOW_NAME}
      class="clipboard-window"
      gdkmonitor={gdkmonitor}
      anchor={initialAnchor}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      margin_top={0}
      margin_bottom={0}
      margin_left={0}
      margin_right={0}
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
          // Do not autofocus search: compact arrows must navigate cards. `/`
          // (or a click) focuses the entry; while focused, text editing wins.
          // `present()` can still hand focus to the first focusable child
          // (the entry), so clear that focus on the next idle tick.
          GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (mode === "compact") {
              root.grab_focus()
              if (!search.has_focus) searchBox.remove_css_class("focused")
            }
            return false
          })
          items = readHistory()
          ensureSelection()
          renderAll()
          scheduleInputRegion()
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
