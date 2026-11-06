/**
 * The pure core of the clipboard overlay's live appearance refresh (AD-27).
 *
 * The runtime invokes `palette-refresh <appearance-hash>` after the appearance
 * pointer moved. The platform's `createAppearanceRefreshHandler` re-applies the
 * whole appearance and makes the request idempotent by that hash; this module
 * owns only the non-destructive widget steps the app performs afterwards.
 *
 * The overlay must converge on the new appearance WITHOUT touching its state:
 * the visible surface, the query, the selected card and the in-memory clipboard
 * list all survive.
 *
 * `applyAppearance(surface)` orders the three widget steps: forget the
 * token/texture caches, rebuild the static search icon, then rebuild the cards.
 * The window supplies the real GTK operations; a test supplies recorders.
 *
 * PURE: no `ags`, no `gi://*`, no I/O.
 */

/** The three GTK operations the overlay performs for one appearance. */
export interface AppearanceSurface {
  /** Drop the palette-token and rasterized-icon caches. */
  clearCaches(): void;
  /** Replace the static search glyph with one rendered from the new palette. */
  rebuildSearchIcon(): void;
  /** Recreate the visible cards, preserving the selected index. */
  rebuildCards(): void;
}

/**
 * Run the non-destructive appearance refresh in its required order.
 *
 * Caches MUST be cleared before either widget tree is rebuilt: a card built
 * from the old token cache would keep the old header contrast, and a search
 * icon copied from the old texture cache would keep the old palette tint.
 */
export function applyAppearance(surface: AppearanceSurface): void {
  surface.clearCaches();
  surface.rebuildSearchIcon();
  surface.rebuildCards();
}
