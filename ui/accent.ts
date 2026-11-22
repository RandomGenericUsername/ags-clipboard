/**
 * Per-widget paint providers for app-owned content accents (USER + 1).
 *
 * The skin owns role surfaces/base states; per-item content colour is
 * app-owned (117 batch rule). A per-widget provider at USER + 1 lets the
 * selected/focused state REPLACE the skin base hairline with exactly one ring
 * instead of stacking an app ring on the skin border.
 */

import { Gtk } from "ags/gtk4"
import type { ItemKind } from "../lib/clipboard-types"
import { TYPE_ACCENT } from "../lib/type-accents"

const providers = new Map<string, Gtk.CssProvider>()

function providerFor(css: string): Gtk.CssProvider {
  const cached = providers.get(css)
  if (cached !== undefined) return cached
  const provider = new Gtk.CssProvider()
  provider.load_from_string(css)
  providers.set(css, provider)
  return provider
}

function addProvider(widget: Gtk.Widget, css: string): void {
  widget
    .get_style_context()
    .add_provider(providerFor(css), Gtk.STYLE_PROVIDER_PRIORITY_USER + 1)
}

export function paintTypeHeader(widget: Gtk.Widget, kind: ItemKind): void {
  const accent = TYPE_ACCENT[kind]
  addProvider(
    widget,
    `.clipboard-head { background-color: @${accent.fill}; color: @${accent.ink}; }`,
  )
}

export function paintTypeDot(widget: Gtk.Widget, kind: ItemKind): void {
  const accent = TYPE_ACCENT[kind]
  addProvider(widget, `.clipboard-type-dot { background-color: @${accent.ink}; }`)
}

export function paintFilterDot(widget: Gtk.Widget, kind: ItemKind): void {
  const accent = TYPE_ACCENT[kind]
  addProvider(widget, `.clipboard-filter-dot { background-color: @${accent.fill}; }`)
}

export function paintPinButton(widget: Gtk.Widget, kind: ItemKind): void {
  const accent = TYPE_ACCENT[kind]
  const ink = `@${accent.ink}`
  addProvider(
    widget,
    `.clipboard-pin-button {
       background-color: alpha(${ink}, 0.20);
       border-color: alpha(${ink}, 0.30);
     }
     .clipboard-pin-button:hover {
       background-color: alpha(${ink}, 0.34);
     }
     .clipboard-pin-button.is-on {
       background-color: alpha(${ink}, 0.46);
       border-color: alpha(${ink}, 0.58);
       box-shadow: inset 0 0 0 1px alpha(${ink}, 0.35);
     }`,
  )
}

/** Selected compact card: suppress the base hairline, draw one content ring. */
export function paintSelectedCard(widget: Gtk.Widget, kind: ItemKind): void {
  const fill = `@${TYPE_ACCENT[kind].fill}`
  addProvider(
    widget,
    `.clipboard-card.selected {
       border-color: transparent;
       background-color: alpha(${fill}, 0.12);
       box-shadow: 0 0 0 2px alpha(${fill}, 0.65);
     }`,
  )
}

/** Focused pinned card: suppress the base hairline, draw ring + soft halo. */
export function paintFocusedPinCard(widget: Gtk.Widget, kind: ItemKind): void {
  const fill = `@${TYPE_ACCENT[kind].fill}`
  addProvider(
    widget,
    `.clipboard-pin-card.focused {
       border-color: transparent;
       box-shadow:
         0 0 0 2px ${fill},
         0 0 0 7px alpha(${fill}, 0.22),
         0 26px 70px alpha(@shadow, 0.5);
     }`,
  )
}
