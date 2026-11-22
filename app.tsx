import app from "ags/gtk4/app"
import Gtk from "gi://Gtk?version=4.0"
import style from "./style.css"
import { createAppearance } from "ags-platform/adapters/appearance"
import {
  APPEARANCE_REFRESH_COMMAND,
  createAppearanceRefreshHandler,
} from "ags-platform/ports/appearance-refresh"
import {
  ClipboardWindow,
  hideWindow,
  refreshClipboardAppearance,
  showWindow,
  toggleWindow,
} from "./ui/ClipboardWindow"
import { handleRequest } from "./lib/requests"

// Generations v3: palette, skin and mode are one immutable generation behind
// `$XDG_STATE_HOME/dotfiles/current`. The platform adapter verifies
// `current/manifest.json`, reads `current/appearance/ags-clipboard.css` plus
// `tokens.json`, and installs the composed sheet as one USER-priority
// provider. The adapter owns the single watcher, so a runtime repoint reloads
// without a clipboard request command.
const appearance = createAppearance({ configDir: "ags-clipboard" })

// App-owned layout constant. The batch rule forbids reading appearance tokens
// from app code; the card width is layout, not paint.
const CARD_WIDTH = 260

// The runtime-owned appearance refresh (AD-27), composed with the overlay's
// existing show/hide/toggle request surface below. The v3 request is
// `appearance-refresh <genHash>`; `createAppearanceRefreshHandler` resolves and
// re-applies THAT generation first, then runs the app-owned work: drop the
// rasterized-icon texture cache, rebuild the static search icon and rebuild
// the cards from the SAME in-memory list. The mapped overlay, query, selection
// and clipboard history are never reset. The helper answers once with the
// generation-bound JSON union (`{"applied":"<genHash>"}`, deferred or failed);
// a void work result is invalid, so the work returns `applied`.
const appearanceRefresh = createAppearanceRefreshHandler(appearance, () => {
  refreshClipboardAppearance()
  return { status: "applied" }
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
    // `appearance-refresh` command to the platform helper, everything else to
    // the overlay's existing controls. The refresh command never falls through
    // to a show/hide/toggle, and the retired `palette-refresh` is not accepted.
    if (argv[0] === APPEARANCE_REFRESH_COMMAND) {
      appearanceRefresh(argv, res)
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
      addWindow(ClipboardWindow(monitor, CARD_WIDTH))
    }
  },
})
