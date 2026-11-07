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
const TYPE_LABEL: Record<ItemKind, string> = {
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

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

/**
 * One clipboard history card: a palette-themed type header
 * (index + glyph + type label + relative time) over a type-appropriate
 * preview body. ``index`` is the 1-based position for ``Ctrl+1..9``.
 */
export function ItemCard(
  item: ClipboardItem,
  index: number,
  onSelect: (item: ClipboardItem) => void,
  onOpenLink: ((item: ClipboardItem) => void) | undefined,
  cardWidth: number,
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

  // CenterBox lays start/end out itself — no child hexpand, which would
  // otherwise propagate up and make the card stretch in the list.
  const header = new Gtk.CenterBox({ css_classes: ["clipboard-head"] })
  const headStart = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
  const badge = new Gtk.Label({ label: String(index), xalign: 0.5 })
  badge.add_css_class("clipboard-index")
  badge.set_size_request(18, 18)
  badge.set_halign(Gtk.Align.CENTER)
  badge.set_valign(Gtk.Align.CENTER)
  headStart.append(badge)
  headStart.append(uiIcon(item.kind, 18))
  const label = new Gtk.Label({ label: TYPE_LABEL[item.kind], xalign: 0 })
  label.add_css_class("clipboard-head-label")
  headStart.append(label)
  header.set_start_widget(headStart)

  const time = new Gtk.Label({ label: relativeTime(item.timestamp) })
  time.add_css_class("clipboard-time")
  header.set_end_widget(time)
  card.append(header)

  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  body.add_css_class("clipboard-body")
  body.append(Preview(item))
  card.append(body)

  // Left click copies the item back.
  const gesture = new Gtk.GestureClick()
  gesture.set_button(Gdk.BUTTON_PRIMARY)
  gesture.connect("released", () => onSelect(item))
  card.add_controller(gesture)

  // Right click on a LINK card opens the URL via the desktop handler.
  if (item.kind === "link" && onOpenLink !== undefined) {
    const rightClick = new Gtk.GestureClick()
    rightClick.set_button(Gdk.BUTTON_SECONDARY)
    rightClick.connect("released", () => onOpenLink(item))
    card.add_controller(rightClick)
  }

  return card
}
