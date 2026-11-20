/**
 * GLib adapter for the clipboard UI settings port.
 *
 * Writes ONLY the app-owned file at
 * `$XDG_CONFIG_HOME/clipboard-ui/config.json` (fallback
 * `$HOME/.config/clipboard-ui/config.json`). This is deliberately not
 * `clipboard/config.json` (the daemon's file), not an AGS config link, and not
 * a path inside an installed, read-only tag.
 */

import GLib from "gi://GLib?version=2.0"
import type { SettingsPort } from "./settings-store"

export function settingsConfigPath(): string {
  const configHome = GLib.getenv("XDG_CONFIG_HOME")
  const base =
    configHome !== null && configHome.length > 0
      ? configHome
      : `${GLib.get_home_dir()}/.config`
  return `${base}/clipboard-ui/config.json`
}

/** The real port: reads and atomically replaces the app-owned JSON file. */
export function createGlibSettingsPort(): SettingsPort {
  return {
    read(): string | null {
      const path = settingsConfigPath()
      if (!GLib.file_test(path, GLib.FileTest.EXISTS)) return null
      try {
        const [ok, bytes] = GLib.file_get_contents(path)
        if (!ok || bytes === null) return null
        return new TextDecoder().decode(bytes)
      } catch (error) {
        console.error(`clipboard: cannot read UI settings: ${error}`)
        return null
      }
    },
    write(text: string): void {
      const path = settingsConfigPath()
      try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755)
        GLib.file_set_contents(path, text)
      } catch (error) {
        console.error(`clipboard: cannot write UI settings: ${error}`)
      }
    },
  }
}
