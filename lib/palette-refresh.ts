/**
 * The clipboard app's `palette-refresh` handler (AD-27; contracts
 * `ags-app-refresh.md`).
 *
 * This module is PURE on purpose: it binds the platform's protocol helper to
 * the app's hash-idempotent appearance refresh, with no `gi://`/`ags` import.
 * The stock-runner contract test therefore executes the SAME handler `app.tsx`
 * registers and proves its single JSON-string response, not a text match.
 *
 * The injected `apply` is the app-side work: re-apply the stable Theme pointer,
 * clear the visual caches, rebuild the search icon and rebuild the cards. It
 * must preserve the overlay's visibility, query, selection and clipboard state;
 * `ui/ClipboardWindow.tsx` owns that non-destructive surface.
 */

import { createPaletteRefreshHandler } from "ags-platform/ports/palette-refresh";
import type { PaletteRefreshRequestHandler } from "ags-platform/ports/palette-refresh";
import { createAppearanceRefresh } from "./appearance.ts";

/**
 * Build the AGS request handler for the clipboard overlay.
 *
 * `apply` is called at most once per distinct appearance hash and only after
 * the previous one succeeded. The platform helper answers exactly once with
 * `JSON.stringify(...)`, as the runtime's string transport requires.
 */
export function createClipboardPaletteRefresh(
  apply: () => void,
): PaletteRefreshRequestHandler {
  return createPaletteRefreshHandler(createAppearanceRefresh(apply));
}
