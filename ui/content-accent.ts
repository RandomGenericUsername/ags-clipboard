/**
 * One app-owned content-accent provider for the whole display.
 *
 * The skin owns role surfaces/base states (117 batch rule); clipboard's
 * per-item type colours are content and must not live in the skin. Installing
 * a single provider at USER + 1 keeps content accents above the skin without
 * touching a provider per card on every render (which caused repeated style
 * invalidation and massive arrow/filter lag).
 */

import { Gtk } from "ags/gtk4"
import Gdk from "gi://Gdk?version=4.0"
import { contentAccentCss } from "../lib/type-accents"

let installed = false

/** Install the one display-wide content provider (idempotent per process). */
export function installContentAccents(): void {
  if (installed) return
  const display = Gdk.Display.get_default()
  if (display === null) return
  const provider = new Gtk.CssProvider()
  provider.load_from_string(contentAccentCss())
  Gtk.StyleContext.add_provider_for_display(
    display,
    provider,
    Gtk.STYLE_PROVIDER_PRIORITY_USER + 1,
  )
  installed = true
}
