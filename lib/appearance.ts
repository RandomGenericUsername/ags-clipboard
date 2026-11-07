/**
 * The pure core of the clipboard overlay's live appearance refresh (AD-27).
 *
 * The runtime invokes `appearance-refresh <genHash>` after the committed
 * generation moved. The platform's `createAppearanceRefreshHandler` re-applies
 * exactly that generation and makes the request idempotent by its hash; this
 * module owns only the non-destructive widget steps the app performs
 * afterwards.
 *
 * The overlay must converge on the new appearance WITHOUT touching its state:
 * the visible surface, the query, the selected card and the in-memory clipboard
 * list all survive.
 *
 * `applyAppearance(surface)` orders the three widget steps: forget the
 * rasterized-icon texture cache, rebuild the static search icon, then rebuild
 * the cards. The window supplies the real GTK operations; a test supplies
 * recorders.
 *
 * PURE: no `ags`, no `gi://*`, no I/O.
 */

/** The three GTK operations the overlay performs for one appearance. */
export interface AppearanceSurface {
  /** Drop the rasterized-icon texture cache. */
  clearCaches(): void;
  /** Replace the static search glyph with one rendered from the new palette. */
  rebuildSearchIcon(): void;
  /** Recreate the visible cards, preserving the selected index. */
  rebuildCards(): void;
}

/**
 * Run the non-destructive appearance refresh in its required order.
 *
 * Caches MUST be cleared before either widget tree is rebuilt: a search icon
 * copied from the old texture cache would keep the old palette tint.
 */
export function applyAppearance(surface: AppearanceSurface): void {
  surface.clearCaches();
  surface.rebuildSearchIcon();
  surface.rebuildCards();
}
