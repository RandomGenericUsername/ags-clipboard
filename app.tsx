import app from "ags/gtk4/app"
import Gtk from "gi://Gtk?version=4.0"
import style from "./style.css"
import { createAppearance } from "ags-platform/adapters/appearance"
import { createAppearanceRefreshHandler } from "ags-platform/ports/appearance-refresh"
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh"
import {
  ClipboardWindow,
  hideWindow,
  refreshClipboardAppearance,
  showWindow,
  toggleWindow,
} from "./ui/ClipboardWindow"
import { handleRequest } from "./lib/requests"

// The v2 appearance plane is app-scoped: palette, skin and mode are published
// as ONE generation behind `$XDG_STATE_HOME/dotfiles/current/appearance`, and
// the platform adapter installs the composed sheet as one USER-priority
// provider. Only the stable consumer link
// (`$XDG_CONFIG_HOME/ags-clipboard/appearance.css`) is per app; the adapter
// owns the single watcher, so a runtime repoint reloads without a clipboard
// request command.
const appearance = createAppearance({ configDir: "ags-clipboard" })

// TSX-owned layout token. The accessor is reactive; `peek()` reads it without
// registering a dependency because `ItemCard` needs a plain pixel number.
const cardWidth = appearance.value("layout.ags-clipboard.card-width", 260)

// The runtime-owned palette refresh (AD-27), composed with the overlay's
// existing show/hide/toggle request surface below. `createAppearanceRefreshHandler`
// re-applies the WHOLE appearance (palette + skin + mode) first, then runs the
// app-owned work: drop the palette-token/texture caches, rebuild the static
// search icon and rebuild the cards from the SAME in-memory list. The mapped
// overlay, query, selection and clipboard history are never reset. The helper
// is idempotent by the opaque appearance hash and answers through the platform
// helper's single JSON-encoded string.
const paletteRefresh = createAppearanceRefreshHandler(appearance, () => {
  refreshClipboardAppearance()
})

/**
 * Register one top-level window with the application.
 *
 * gnim types a JSX element — what `ClipboardWindow(monitor)` returns — as
 * `JSX.Element`, which it declares as the base `GObject.Object`, while AGS's
 * `app.add_window` is typed to take a `Gtk.Window`. At runtime the object a JSX
 * root call returns IS the `Gtk.Window` the tree was rooted in (the overlay
 * cannot start otherwise), so the cast states a runtime truth the compiler
 * cannot see. Same helper as `bar/app.tsx`.
 */
function addWindow(element: JSX.Element): void {
  app.add_window(element as Gtk.Window)
}

app.start({
  instanceName: "clipboard",
  css: style,
  // External control surface, mirroring `bar/app.tsx`. The overlay starts
  // hidden and runs with keymode ON_DEMAND, so two paths depend on this:
  //   1. the launcher's start-if-down branch can only *start* the instance, so
  //      it needs `ags request show` to reveal the freshly started window;
  //   2. the global Escape keybind runs `ags request popup-close` (the bar's
  //      name) -- without a handler that logs `instance "clipboard" has no
  //      request handler implemented` and strands the overlay.
  // `toggle` mirrors the `ags toggle` window command so either spelling works.
  requestHandler(argv: string[], res: (response: string) => void) {
    // One `requestHandler` (AGS exposes a single slot): dispatch the fixed
    // palette command to the platform helper, everything else to the overlay's
    // existing controls. `palette-refresh` never falls through to a
    // show/hide/toggle.
    if (argv[0] === PALETTE_REFRESH_COMMAND) {
      paletteRefresh(argv, res)
      return
    }
    handleRequest(argv, res, {
      show: showWindow,
      hide: hideWindow,
      toggle: toggleWindow,
    })
  },
  main() {
    // Reuse the runtime-composed appearance so the overlay matches the rest
    // of the desktop. One provider carries the palette roles, the skin and the
    // resolved mode; missing artifacts are a no-op, leaving the bundled
    // style.css glass fallback in place.
    appearance.apply()
    for (const monitor of app.get_monitors()) {
      addWindow(ClipboardWindow(monitor, cardWidth))
    }
  },
})
