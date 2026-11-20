/**
 * Clipboard UI settings — the pure domain (no `gi://*`, no I/O).
 *
 * The real contract is an app-owned JSON file at
 * `$XDG_CONFIG_HOME/clipboard-ui/config.json`:
 *
 *   {
 *     "layout": {
 *       "mode": "full",
 *       "compact": { "card_size": "medium", "alignment": "bottom" }
 *     }
 *   }
 *
 * Unknown, missing or corrupt values degrade to `full` / `medium` / `bottom`.
 * The same shape is used by the mock's `localStorage` so the review surface and
 * the app agree on every value.
 */

export type LayoutMode = "full" | "compact";
export type CompactSize = "small" | "medium" | "large";
export type CompactAlignment = "bottom" | "left" | "right";
export type CompactView = "recent" | "pinned";

/** Card widths for the compact strip (contract values). */
export const COMPACT_SIZES: Readonly<Record<CompactSize, number>> = {
  small: 220,
  medium: 260,
  large: 300,
};

export const COMPACT_ALIGNMENTS: readonly CompactAlignment[] = [
  "bottom",
  "left",
  "right",
];

export const COMPACT_VIEWS: readonly CompactView[] = ["recent", "pinned"];

export interface CompactSettings {
  card_size: CompactSize;
  alignment: CompactAlignment;
}

export interface LayoutSettings {
  mode: LayoutMode;
  compact: CompactSettings;
}

export interface ClipboardSettings {
  layout: LayoutSettings;
}

export function defaultSettings(): ClipboardSettings {
  return {
    layout: {
      mode: "full",
      compact: { card_size: "medium", alignment: "bottom" },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function nested(raw: unknown, ...path: string[]): unknown {
  let value = raw;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

function asMode(value: unknown): LayoutMode {
  return value === "compact" ? "compact" : "full";
}

function asSize(value: unknown): CompactSize {
  return value === "small" || value === "large" ? value : "medium";
}

function asAlignment(value: unknown): CompactAlignment {
  return value === "left" || value === "right" ? value : "bottom";
}

/**
 * Coerce any parsed value into the documented settings shape.
 *
 * Every field is independent: a valid `mode` survives a corrupt `card_size`
 * and vice versa, which keeps a hand-edited file usable instead of resetting
 * the whole configuration.
 */
export function normalizeSettings(raw: unknown): ClipboardSettings {
  return {
    layout: {
      mode: asMode(nested(raw, "layout", "mode")),
      compact: {
        card_size: asSize(nested(raw, "layout", "compact", "card_size")),
        alignment: asAlignment(nested(raw, "layout", "compact", "alignment")),
      },
    },
  };
}

/** Build a settings document from the three UI controls. */
export function settingsFor(
  mode: LayoutMode,
  cardSize: CompactSize,
  alignment: CompactAlignment = "bottom",
): ClipboardSettings {
  return normalizeSettings({
    layout: { mode, compact: { card_size: cardSize, alignment } },
  });
}

/** Serialize exactly the documented shape (stable key order). */
export function serializeSettings(settings: ClipboardSettings): string {
  const normalized = normalizeSettings(settings);
  return JSON.stringify({
    layout: {
      mode: normalized.layout.mode,
      compact: {
        card_size: normalized.layout.compact.card_size,
        alignment: normalized.layout.compact.alignment,
      },
    },
  });
}

/** Pixel width of a compact card for a size token. */
export function compactCardWidth(size: CompactSize): number {
  return COMPACT_SIZES[asSize(size)];
}

/** Left/Right compact alignments are vertical columns. */
export function compactIsVertical(alignment: CompactAlignment): boolean {
  return alignment === "left" || alignment === "right";
}
