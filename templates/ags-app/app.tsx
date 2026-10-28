import app from "ags/gtk4/app"
import Gtk from "gi://Gtk?version=4.0"
import style from "./style.css"
import { theme } from "ags-platform/adapters/theme"
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh"
import { AppWindow, refreshAppAppearance } from "./ui/AppWindow"
import { createAppPaletteRefresh } from "./lib/palette-refresh"

// The runtime-owned live refresh (AD-27). Replace the injected work with this
// app's non-destructive surface refresh: re-apply the Theme pointer, clear the
// app's visual caches and rebuild the themed widgets while preserving any
// visible surface, selection and unsaved state.
const paletteRefresh = createAppPaletteRefresh(() => {
  theme.apply()
  refreshAppAppearance()
})

function addWindow(element: JSX.Element): void {
  app.add_window(element as Gtk.Window)
}

app.start({
  instanceName: "{{INSTANCE}}",
  css: style,
  requestHandler(argv: string[], res: (response: string) => void) {
    if (argv[0] === PALETTE_REFRESH_COMMAND) {
      paletteRefresh(argv, res)
      return
    }
    res(`unknown request: ${argv.join(" ")}`)
  },
  main() {
    theme.apply()
    for (const monitor of app.get_monitors()) {
      addWindow(AppWindow(monitor))
    }
  },
})
