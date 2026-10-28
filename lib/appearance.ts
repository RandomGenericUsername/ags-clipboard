/**
 * The pure core of the clipboard overlay's live appearance refresh (AD-27).
 *
 * The runtime invokes `palette-refresh <appearance-hash>` after the palette
 * pointer moved. The app must converge on the new appearance WITHOUT touching
 * the overlay's state: the visible surface, the query, the selected card and
 * the in-memory clipboard list all survive.
 *
 * Two separate concerns live here so a stock-runner test can execute them with
 * no `gi://`/`ags` imports:
 *
 * 1. `applyAppearance(surface)` orders the three non-destructive widget steps:
 *    forget the token/texture caches, rebuild the static search icon, then
 *    rebuild the cards. The window supplies the real GTK operations; a test
 *    supplies recorders.
 * 2. `createAppearanceRefresh(apply)` makes the whole thing idempotent by the
 *    opaque appearance hash: the same hash does no work and still reports
 *    `applied`, while a new hash runs the refresh. A throw is not recorded as
 *    applied, so the runtime's next trigger retries it.
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

/** What the platform's `createPaletteRefreshHandler` accepts as applied. */
export interface AppearanceApplied {
  status: "applied";
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

/**
 * Wrap an appearance application as a hash-idempotent refresh.
 *
 * The refresh is opaque to the hash; the app only records which appearance it
 * last applied successfully. Repeated triggers for the same hash are safe and
 * cheap (the runtime ledger retries failures, not successes). A new hash runs
 * the refresh; a failed refresh leaves the previous hash in place so the next
 * trigger retries it.
 */
export function createAppearanceRefresh(
  apply: () => void,
): (appearanceHash: string) => AppearanceApplied {
  let appliedHash: string | null = null;

  return (appearanceHash: string): AppearanceApplied => {
    if (appearanceHash !== appliedHash) {
      apply();
      appliedHash = appearanceHash;
    }
    return { status: "applied" };
  };
}
