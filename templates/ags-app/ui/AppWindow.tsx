import { Astal, Gdk, Gtk } from "ags/gtk4"
import { applyAppearance, type AppearanceSurface } from "../lib/appearance"

export const WINDOW_NAME = "{{WINDOW}}"

const appearanceSurfaces: AppearanceSurface[] = []

/** Rebuild every window's themed widgets from the current palette pointer. */
export function refreshAppAppearance(): void {
  for (const surface of appearanceSurfaces) applyAppearance(surface)
}

/** A minimal top-level window with the three refresh steps wired. */
export function AppWindow(gdkmonitor: Gdk.Monitor) {
  // Replace these with the app's real caches and widget containers.
  const textureCache = new Map<string, Gdk.Texture>()
  const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
  let icon = Gtk.Image.new_from_icon_name("applications-system-symbolic")
  header.append(icon)
  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })

  function clearCaches(): void {
    textureCache.clear()
  }

  function rebuildSearchIcon(): void {
    const next = Gtk.Image.new_from_icon_name("applications-system-symbolic")
    header.remove(icon)
    header.prepend(next)
    icon = next
  }

  function rebuildCards(): void {
    // Replace with the app's full, non-destructive card rebuild. Do not reset
    // the query, selection, visibility or domain state here.
  }

  appearanceSurfaces.push({ clearCaches, rebuildSearchIcon, rebuildCards })

  return (
    <window
      visible={false}
      name={WINDOW_NAME}
      gdkmonitor={gdkmonitor}
      anchor={Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        {header}
        {content}
      </box>
    </window>
  )
}
