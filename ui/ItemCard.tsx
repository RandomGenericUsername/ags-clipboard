import { Gtk } from "ags/gtk4"
import Gdk from "gi://Gdk?version=4.0"
import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import type { ClipboardItem, ItemKind } from "../lib/clipboard-types"
import { registryProvider } from "ags-platform/adapters/icon"
import { Preview } from "./Preview"

//: Stock symbolic fallbacks (used only until the themed `ui-*.svg` renders).
const FALLBACK_ICON: Record<string, string> = {
  search: "system-search-symbolic",
  text: "text-x-generic-symbolic",
  image: "image-x-generic-symbolic",
  link: "insert-link-symbolic",
  code: "text-x-script-symbolic",
  color: "applications-graphics-symbolic",
  emoji: "face-smile-symbolic",
  pin: "view-pin-symbolic",
  open: "external-link-symbolic",
  external: "external-link-symbolic",
  settings: "emblem-system-symbolic",
  pause: "media-playback-pause-symbolic",
  play: "media-playback-start-symbolic",
  trash: "user-trash-symbolic",
  copy: "edit-copy-symbolic",
  down: "go-down-symbolic",
}

//: Rasterized-at-size icon textures, shared across cards.
const textureCache = new Map<string, Gdk.Texture>()

function iconTexture(path: string, size: number): Gdk.Texture {
  const key = `${path}:${size}`
  const cached = textureCache.get(key)
  if (cached !== undefined) return cached
  let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(path, size, size)
  if (pixbuf.get_width() > size || pixbuf.get_height() > size) {
    const factor = Math.min(size / pixbuf.get_width(), size / pixbuf.get_height())
    const scaled = pixbuf.scale_simple(
      Math.max(1, Math.round(pixbuf.get_width() * factor)),
      Math.max(1, Math.round(pixbuf.get_height() * factor)),
      GdkPixbuf.InterpType.BILINEAR,
    )
    if (scaled !== null) pixbuf = scaled
  }
  const texture = Gdk.Texture.new_for_pixbuf(pixbuf)
  textureCache.set(key, texture)
  return texture
}

/**
 * Shared UI glyph from the themed `ui` group (ITR-rendered, palette-tinted),
 * falling back to a stock symbolic icon until the render exists.
 */
export function uiIcon(variant: string, size = 18): Gtk.Widget {
  // The platform's registry-backed `IconProvider` (spine AD-4/AD-7) replaces
  // the app-local icon-registry copy. A rendered SVG is a `file` source;
  // anything else (no art for the variant, or a symbolic `name` on a bare
  // desktop) falls through to the stock symbolic fallback below.
  const source = registryProvider.resolve("ui", variant)
  if (source !== null && source.kind === "file") {
    try {
      const picture = Gtk.Picture.new_for_paintable(iconTexture(source.path, size))
      picture.set_content_fit(Gtk.ContentFit.CONTAIN)
      picture.set_size_request(size, size)
      picture.set_halign(Gtk.Align.CENTER)
      picture.set_valign(Gtk.Align.CENTER)
      picture.add_css_class("clipboard-ui-icon")
      return picture
    } catch (error) {
      console.error(`clipboard: cannot load icon ${source.path}: ${error}`)
    }
  }
  const fallback = Gtk.Image.new_from_icon_name(
    FALLBACK_ICON[variant] ?? "text-x-generic-symbolic",
  )
  fallback.set_pixel_size(size)
  fallback.set_halign(Gtk.Align.CENTER)
  fallback.set_valign(Gtk.Align.CENTER)
  return fallback
}

//: Header fills and their matching Material `on_*` ink live entirely in
//: style.css (`.kind-* .clipboard-head`). The card only adds its kind class, so
//: the ink follows the v2 appearance roles without any runtime color math.
export const TYPE_LABEL: Record<ItemKind, string> = {
  text: "Text",
  code: "Code",
  color: "Color",
  image: "Image",
  link: "Link",
  emoji: "Emoji",
}

/**
 * Drop every visual cache a palette change invalidates (AD-27).
 *
 * `textureCache` holds rasterized themed glyphs at their old tint. The
 * appearance-refresh surface calls this BEFORE rebuilding the cards and the
 * static search icon, so both read the repointed appearance roles.
 */
export function clearVisualCaches(): void {
  textureCache.clear()
}

export function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export interface HeadOptions {
  /** 1-based position; omit on the full stage card. */
  index?: number
  /** Larger glyph/label for the stage and pinned cards. */
  stage?: boolean
  /** Show a pin marker (or a pin button when `onTogglePin` is given). */
  pin?: boolean
  onTogglePin?: (item: ClipboardItem) => void
  /** Shared per-card guard: a child control sets this before the card gesture. */
  suppress?: { until: number }
}

/**
 * Mark a child control (pin/Open) as claiming the click so the enclosing card
 * gesture does not also select/copy. The controller runs in the capture phase,
 * before the card's bubble-phase gesture.
 */
function guardChildClick(widget: Gtk.Widget, suppress: { until: number }): void {
  const guard = new Gtk.GestureClick()
  guard.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  guard.connect("pressed", () => {
    suppress.until = Date.now() + 300
  })
  widget.add_controller(guard)
}

/**
 * The card header: glyph, small type dot, type label, optional index, pin and
 * relative time. The plate itself is neutral; the dot is the only type-coloured
 * element.
 */
export function ItemHead(item: ClipboardItem, options: HeadOptions = {}): Gtk.CenterBox {
  // CenterBox lays start/end out itself — no child hexpand, which would
  // otherwise propagate up and make the card stretch in the list.
  const header = new Gtk.CenterBox({ css_classes: ["clipboard-head"] })
  const headStart = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
  if (options.index !== undefined) {
    const badge = new Gtk.Label({ label: String(options.index), xalign: 0.5 })
    badge.add_css_class("clipboard-index")
    badge.set_size_request(18, 18)
    badge.set_halign(Gtk.Align.CENTER)
    badge.set_valign(Gtk.Align.CENTER)
    headStart.append(badge)
  }
  headStart.append(uiIcon(item.kind, options.stage ? 20 : 18))
  const dot = new Gtk.Box()
  dot.add_css_class("clipboard-type-dot")
  dot.add_css_class(`kind-${item.kind}`)
  dot.set_size_request(6, 6)
  dot.set_halign(Gtk.Align.CENTER)
  dot.set_valign(Gtk.Align.CENTER)
  headStart.append(dot)
  const label = new Gtk.Label({ label: TYPE_LABEL[item.kind], xalign: 0 })
  label.add_css_class("clipboard-head-label")
  if (options.stage) label.add_css_class("clipboard-head-label-stage")
  headStart.append(label)
  if (options.pin === true) {
    if (options.onTogglePin !== undefined) {
      const pinButton = new Gtk.Button({ css_classes: ["clipboard-pin-button"] })
      pinButton.set_child(uiIcon("pin", 13))
      pinButton.set_size_request(22, 22)
      pinButton.set_hexpand(false)
      pinButton.set_vexpand(false)
      pinButton.set_halign(Gtk.Align.CENTER)
      pinButton.set_valign(Gtk.Align.CENTER)
      pinButton.set_tooltip_text(item.favorite ? "Unpin" : "Pin")
      if (options.suppress !== undefined) guardChildClick(pinButton, options.suppress)
      if (item.favorite) pinButton.add_css_class("is-on")
      pinButton.connect("clicked", () => options.onTogglePin?.(item))
      headStart.append(pinButton)
    } else if (item.favorite) {
      const mark = uiIcon("pin", 13)
      mark.add_css_class("clipboard-pin-mark")
      headStart.append(mark)
    }
  }
  header.set_start_widget(headStart)

  const time = new Gtk.Label({ label: relativeTime(item.timestamp) })
  time.add_css_class("clipboard-time")
  header.set_end_widget(time)
  return header
}

/** Attach the card click gestures once (single click + optional double). */
function attachCardGestures(
  card: Gtk.Widget,
  item: ClipboardItem,
  onSelect: (item: ClipboardItem) => void,
  onActivate?: (item: ClipboardItem) => void,
  onOpenLink?: (item: ClipboardItem) => void,
  suppress?: { until: number },
): void {
  const claimed = () => suppress !== undefined && Date.now() < suppress.until

  const gesture = new Gtk.GestureClick()
  gesture.set_button(Gdk.BUTTON_PRIMARY)
  gesture.connect("released", () => {
    if (claimed()) return
    onSelect(item)
  })
  card.add_controller(gesture)

  if (onActivate !== undefined) {
    const doubleClick = new Gtk.GestureClick()
    doubleClick.set_button(Gdk.BUTTON_PRIMARY)
    doubleClick.connect("pressed", (_gesture, nPress: number) => {
      if (nPress === 2 && !claimed()) onActivate(item)
    })
    card.add_controller(doubleClick)
  }

  // Right click on a LINK card opens the URL via the desktop handler.
  if (item.kind === "link" && onOpenLink !== undefined) {
    const rightClick = new Gtk.GestureClick()
    rightClick.set_button(Gdk.BUTTON_SECONDARY)
    rightClick.connect("released", () => {
      if (claimed()) return
      onOpenLink(item)
    })
    card.add_controller(rightClick)
  }
}

/**
 * One compact-strip card: the palette-themed type header over a
 * type-appropriate preview body. ``index`` is the 1-based position in the
 * active view for ``Ctrl+1..9``.
 */
export function ItemCard(
  item: ClipboardItem,
  index: number,
  onSelect: (item: ClipboardItem) => void,
  onOpenLink: ((item: ClipboardItem) => void) | undefined,
  cardWidth: number,
  onActivate?: (item: ClipboardItem) => void,
  onTogglePin?: (item: ClipboardItem) => void,
): Gtk.Box {
  const card = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["clipboard-card", `kind-${item.kind}`],
  })
  // Clip children to the rounded card corners (GTK does not do this by
  // default), so the header/body follow the card radius like the mockup.
  card.set_overflow(Gtk.Overflow.HIDDEN)
  card.set_size_request(cardWidth, -1)
  card.set_hexpand(false)
  card.set_halign(Gtk.Align.START)

  const suppress = { until: 0 }
  card.append(ItemHead(item, { index, pin: true, onTogglePin, suppress }))

  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
  body.add_css_class("clipboard-body")
  body.append(Preview(item, { width: cardWidth - 24 }))
  if (item.kind === "link" && onOpenLink !== undefined) {
    // Visible, always-present chip (not hover-only) in every compact view and
    // alignment. It calls the same openLink path as full mode and claims the
    // click so the card selection does not change.
    const open = new Gtk.Button({ label: "Open", css_classes: ["clipboard-open-chip"] })
    open.set_halign(Gtk.Align.START)
    open.set_tooltip_text(`Open ${item.text ?? "link"}`)
    guardChildClick(open, suppress)
    open.connect("clicked", () => onOpenLink(item))
    body.append(open)
  }
  card.append(body)

  attachCardGestures(card, item, onSelect, onActivate, onOpenLink, suppress)
  return card
}

/** The one large focused card of the full stage. */
export function StageCard(
  item: ClipboardItem,
  onSelect: (item: ClipboardItem) => void,
  onOpenLink: ((item: ClipboardItem) => void) | undefined,
  width: number,
  height: number,
  onTogglePin?: (item: ClipboardItem) => void,
): Gtk.Box {
  const card = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["clipboard-stage-card", `kind-${item.kind}`],
  })
  card.set_overflow(Gtk.Overflow.HIDDEN)
  card.set_size_request(width, height)
  card.set_hexpand(false)
  card.set_halign(Gtk.Align.CENTER)
  card.set_valign(Gtk.Align.CENTER)
  const suppress = { until: 0 }
  card.append(ItemHead(item, { stage: true, pin: true, onTogglePin, suppress }))

  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  body.add_css_class("clipboard-stage-body")
  body.add_css_class(`clipboard-stage-body-${item.kind}`)
  body.set_vexpand(true)
  body.append(
    Preview(item, {
      stage: true,
      width: Math.max(240, width - 48),
      height: Math.max(160, height - 120),
    }),
  )
  card.append(body)

  attachCardGestures(card, item, onSelect, undefined, onOpenLink, suppress)
  return card
}

/** A narrow, dimmed previous/next card on the full stage. */
export function PeekCard(
  item: ClipboardItem | null,
  onSelect: (item: ClipboardItem) => void,
  width: number,
  height: number,
  onTogglePin?: (item: ClipboardItem) => void,
): Gtk.Box {
  const button = new Gtk.Box({ css_classes: ["clipboard-peek"] })
  button.set_size_request(width, height)
  button.set_halign(Gtk.Align.CENTER)
  button.set_valign(Gtk.Align.CENTER)
  if (item === null) {
    button.set_visible(false)
    return button
  }
  button.set_tooltip_text(`Show ${TYPE_LABEL[item.kind]} card`)
  const card = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: [`kind-${item.kind}`],
  })
  card.add_css_class("clipboard-peek-card")
  card.set_overflow(Gtk.Overflow.HIDDEN)
  const suppress = { until: 0 }
  card.append(ItemHead(item, { pin: true, onTogglePin, suppress }))
  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  body.add_css_class("clipboard-peek-body")
  body.append(Preview(item, { width: width - 24, height: Math.max(60, height - 90) }))
  card.append(body)
  button.append(card)
  attachCardGestures(button, item, onSelect, undefined, undefined, suppress)
  return button
}

/** One card in the full-mode pinned grid. */
export function PinCard(
  item: ClipboardItem,
  index: number,
  focused: boolean,
  onActivate: (item: ClipboardItem) => void,
  width: number,
  onTogglePin?: (item: ClipboardItem) => void,
): Gtk.Box {
  const button = new Gtk.Box({
    css_classes: ["clipboard-pin-card", `kind-${item.kind}`],
  })
  button.set_size_request(-1, 236)
  button.set_hexpand(true)
  button.set_vexpand(false)
  button.set_halign(Gtk.Align.FILL)
  button.set_valign(Gtk.Align.FILL)
  if (focused) button.add_css_class("focused")
  button.set_tooltip_text(`Copy ${TYPE_LABEL[item.kind]} card`)

  const card = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: [`kind-${item.kind}`],
  })
  card.set_overflow(Gtk.Overflow.HIDDEN)
  card.set_vexpand(true)
  const suppress = { until: 0 }
  card.append(ItemHead(item, { index, pin: true, onTogglePin, suppress }))
  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  body.add_css_class("clipboard-pin-body")
  body.set_vexpand(true)
  body.append(Preview(item, { width: Math.max(140, width - 26) }))
  card.append(body)
  button.append(card)
  attachCardGestures(button, item, onActivate, undefined, undefined, suppress)
  return button
}
