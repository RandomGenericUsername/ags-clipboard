/**
 * Settings load/save orchestration over an injected port — the capture-tool
 * pattern (pure domain + port + GLib adapter, save-on-change).
 *
 * PURE: no `gi://*`, no direct file access. The GLib adapter lives in
 * `settings-glib.ts`; tests drive this module with an in-memory port.
 */

import {
  defaultSettings,
  normalizeSettings,
  serializeSettings,
  type ClipboardSettings,
} from "./settings.ts"

/** The only thing the store needs from the platform. */
export interface SettingsPort {
  /** Current file contents, or `null` when the file is absent/unreadable. */
  read(): string | null
  /** Replace the file contents (creating parent directories as needed). */
  write(text: string): void
}

/**
 * Read + normalize the settings document.
 *
 * A missing file, invalid JSON or a non-object document degrades to the
 * defaults instead of throwing; the overlay always has a usable layout.
 */
export function loadSettings(port: SettingsPort): ClipboardSettings {
  const raw = port.read()
  if (raw === null || raw.trim().length === 0) return defaultSettings()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultSettings()
  }
  return normalizeSettings(parsed)
}

/** Persist the normalized document; returns the value that was written. */
export function saveSettings(
  port: SettingsPort,
  settings: ClipboardSettings,
): ClipboardSettings {
  const normalized = normalizeSettings(settings)
  try {
    port.write(serializeSettings(normalized))
  } catch (error) {
    console.error(`clipboard: cannot save UI settings: ${error}`)
  }
  return normalized
}
