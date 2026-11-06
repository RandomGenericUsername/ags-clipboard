import app from "ags/gtk4/app"
import Gtk from "gi://Gtk?version=4.0"
import style from "./style.css"
import { theme } from "ags-platform/adapters/theme"
import { createAppSkin } from "ags-platform/adapters/skin"
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh"
import {
  ClipboardWindow,
  hideWindow,
  refreshClipboardAppearance,
  showWindow,
  toggleWindow,
} from "./ui/ClipboardWindow"
import { handleRequest } from "./lib/requests"
import { createClipboardPaletteRefresh } from "./lib/palette-refresh"

// The skin plane is app-scoped: only the CSS pointer
// ($XDG_CONFIG_HOME/ags-clipboard/skin.css) is per app; the token map and both
// palette artifacts are shared. The adapter owns its own file monitor, so a
// runtime repoint of skin.css reloads without a clipboard request command.
const skin = createAppSkin({ configDir: "ags-clipboard" })

// The runtime-owned palette refresh (AD-27), composed with the overlay's
// existing show/hide/toggle request surface below. This is the real refresh,
// not a Theme-only ack: it re-applies the stable Theme pointer, drops the
// palette-token/texture caches, rebuilds the static search icon and rebuilds
// the cards from the SAME in-memory list. The mapped overlay, query, selection
// and clipboard history are never reset. `createClipboardPaletteRefresh` makes
// it idempotent by the opaque appearance hash and answers through the platform
// helper's single JSON-encoded string.
const paletteRefresh = createClipboardPaletteRefresh(() => {
  theme.apply()
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
    // Reuse the shell's generated palette so the overlay matches the bar.
    // Applied through the Theme port (spine AD-13): the adapter owns WHICH
    // artifact is applied — the stable `colors.css` pointer, repointed on
    // every palette change — so this file no longer reads the path itself.
    theme.apply()
    // The skin plane (frozen Skin Spec v1) is applied AFTER the palette: its
    // composed provider carries the palette roles plus the runtime-expanded
    // skin.css at USER priority, over the bundled style.css glass fallback.
    skin.apply()
    for (const monitor of app.get_monitors()) {
      addWindow(ClipboardWindow(monitor))
    }
  },
})
