/**
 * The app's palette-refresh handler wiring. PURE: no `ags`/`gi://*` imports, so
 * the stock-runner conformance test executes the SAME handler app.tsx uses.
 */

import { createPaletteRefreshHandler } from "ags-platform/ports/palette-refresh"
import type { PaletteRefreshRequestHandler } from "ags-platform/ports/palette-refresh"
import { createAppearanceRefresh } from "./appearance.ts"

export function createAppPaletteRefresh(
  apply: () => void,
): PaletteRefreshRequestHandler {
  return createPaletteRefreshHandler(createAppearanceRefresh(apply))
}
