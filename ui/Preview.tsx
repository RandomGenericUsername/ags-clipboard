import { Gtk } from "ags/gtk4"
import Gdk from "gi://Gdk?version=4.0"
import GdkPixbuf from "gi://GdkPixbuf?version=2.0"
import Pango from "gi://Pango?version=1.0"
import type { ClipboardItem } from "../lib/clipboard-types"
import { itemTitle } from "../lib/clipboard-types"

const BODY_WIDTH = 236
const BODY_HEIGHT = 118
//: Cap a label's natural width (chars) so long lines cannot widen the card.
const MAX_CHARS = 34

export interface PreviewOptions {
  /** Body width in px (stage cards are wider than strip cards). */
  width?: number
  /** Preview height in px. */
  height?: number
  /** Full-stage rendering: larger glyphs, more lines, RGB/HSL labels. */
  stage?: boolean
}

function parseHexColor(value: string | null): { r: number; g: number; b: number } | null {
  if (value === null) return null
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/)
  if (match === null) return null
  const int = Number.parseInt(match[1], 16)
  return {
    r: ((int >> 16) & 0xff) / 255,
    g: ((int >> 8) & 0xff) / 255,
    b: (int & 0xff) / 255,
  }
}

function rgbLabel(rgb: { r: number; g: number; b: number }): string {
  const to255 = (value: number) => Math.round(value * 255)
  return `rgb(${to255(rgb.r)}, ${to255(rgb.g)}, ${to255(rgb.b)})`
}

function hslLabel(rgb: { r: number; g: number; b: number }): string {
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === rgb.r) h = ((rgb.g - rgb.b) / d) % 6
    else if (max === rgb.g) h = (rgb.b - rgb.r) / d + 2
    else h = (rgb.r - rgb.g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

function domainOf(text: string | null): string {
  const value = (text ?? "").trim()
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return value
  }
}

/** Type-appropriate preview body for a card (bounded to the card width). */
export function Preview(item: ClipboardItem, options: PreviewOptions = {}): Gtk.Widget {
  const width = options.width ?? BODY_WIDTH
  const height = options.height ?? BODY_HEIGHT
  const stage = options.stage === true

  if (item.kind === "image" && item.path !== null) {
    try {
      // Rasterize at the target size so the Picture's NATURAL size is bounded
      // (otherwise it reports the full source image and widens the card).
      const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(item.path, width, height)
      const picture = Gtk.Picture.new_for_paintable(Gdk.Texture.new_for_pixbuf(pixbuf))
      picture.set_content_fit(Gtk.ContentFit.COVER)
      picture.set_size_request(width, height)
      // Gtk.Picture reports expand via compute_expand; putting it in a
      // Gtk.Fixed (which does not propagate expand) keeps the card fixed-size.
      const fixed = new Gtk.Fixed()
      fixed.set_size_request(width, height)
      fixed.set_overflow(Gtk.Overflow.HIDDEN)
      fixed.put(picture, 0, 0)
      const wrap = new Gtk.Box({ css_classes: ["clipboard-thumb-wrap"] })
      wrap.set_overflow(Gtk.Overflow.HIDDEN)
      wrap.append(fixed)
      return wrap
    } catch (error) {
      console.error(`clipboard: cannot load image ${item.path}: ${error}`)
    }
  }

  if (item.kind === "color") {
    const box = new Gtk.Box({
      orientation: stage ? Gtk.Orientation.HORIZONTAL : Gtk.Orientation.VERTICAL,
      spacing: 16,
    })
    box.add_css_class("clipboard-color")
    const area = new Gtk.DrawingArea()
    area.set_content_width(stage ? 190 : width)
    area.set_content_height(stage ? Math.max(120, height) : 64)
    const rgb = parseHexColor(item.text)
    area.set_draw_func((_widget, cr, drawWidth, drawHeight) => {
      if (rgb !== null) cr.setSourceRGB(rgb.r, rgb.g, rgb.b)
      else cr.setSourceRGB(0.2, 0.2, 0.2)
      cr.rectangle(0, 0, drawWidth, drawHeight)
      cr.fill()
    })
    const wrap = new Gtk.Box({ css_classes: ["clipboard-swatch-wrap"] })
    wrap.set_overflow(Gtk.Overflow.HIDDEN)
    wrap.append(area)
    box.append(wrap)

    const labels = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    labels.set_valign(Gtk.Align.CENTER)
    const hex = new Gtk.Label({ label: (item.text ?? "").trim(), xalign: 0 })
    hex.add_css_class("clipboard-hex")
    labels.append(hex)
    if (stage) {
      if (rgb !== null) {
        const rgbText = new Gtk.Label({ label: rgbLabel(rgb), xalign: 0 })
        rgbText.add_css_class("clipboard-color-meta")
        labels.append(rgbText)
        const hslText = new Gtk.Label({ label: hslLabel(rgb), xalign: 0 })
        hslText.add_css_class("clipboard-color-meta")
        labels.append(hslText)
      }
      const hint = new Gtk.Label({ label: "Enter copies · Open opens a link", xalign: 0 })
      hint.add_css_class("clipboard-hint")
      labels.append(hint)
    }
    box.append(labels)
    return box
  }

  if (stage && item.kind === "link") {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    box.set_valign(Gtk.Align.CENTER)
    box.set_halign(Gtk.Align.CENTER)
    const domain = new Gtk.Label({ label: domainOf(item.text), xalign: 0 })
    domain.add_css_class("clipboard-stage-domain")
    domain.set_ellipsize(Pango.EllipsizeMode.END)
    box.append(domain)
    const url = new Gtk.Label({ label: (item.text ?? "").trim(), xalign: 0 })
    url.add_css_class("clipboard-stage-url")
    url.set_wrap(true)
    url.set_wrap_mode(Pango.WrapMode.WORD_CHAR)
    url.set_ellipsize(Pango.EllipsizeMode.END)
    url.set_lines(2)
    url.set_max_width_chars(stage ? 64 : MAX_CHARS)
    box.append(url)
    const hint = new Gtk.Label({
      label: "Right-click the card or use Open",
      xalign: 0,
    })
    hint.add_css_class("clipboard-hint")
    box.append(hint)
    return box
  }

  const label = new Gtk.Label({ label: itemTitle(item), xalign: 0, yalign: 0 })
  label.set_wrap(true)
  label.set_wrap_mode(Pango.WrapMode.WORD_CHAR)
  label.set_ellipsize(Pango.EllipsizeMode.END)
  label.set_lines(item.kind === "code" ? (stage ? 10 : 6) : stage ? 8 : 5)
  // Bound the natural width so a long line cannot stretch the card.
  label.set_width_chars(stage ? 58 : MAX_CHARS)
  label.set_max_width_chars(stage ? 58 : MAX_CHARS)
  label.add_css_class("clipboard-text")
  if (item.kind === "code") label.add_css_class("clipboard-code")
  if (item.kind === "link") label.add_css_class("clipboard-link")
  if (item.kind === "emoji") {
    label.add_css_class("clipboard-emoji")
    if (stage) label.add_css_class("clipboard-emoji-stage")
  }
  return label
}
