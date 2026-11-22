/**
 * App-owned content accents for clipboard item types.
 *
 * These are per-item/content colours, not role surfaces: the skin paints the
 * role surfaces/base states, while the app owns the type mapping. The six
 * families are the scheme's accents (primary/secondary/tertiary), not error or
 * neutral-black roles.
 */

import type { ItemKind } from "./clipboard-types"

export interface TypeAccent {
  /** Header-plate fill / filter-dot colour. */
  fill: string
  /** Matching header ink / header-dot colour. */
  ink: string
}

export const TYPE_ACCENT: Readonly<Record<ItemKind, TypeAccent>> = {
  text: { fill: "primary", ink: "on_primary" },
  link: { fill: "primary_container", ink: "on_primary_container" },
  code: { fill: "secondary_container", ink: "on_secondary_container" },
  image: { fill: "secondary", ink: "on_secondary" },
  color: { fill: "tertiary", ink: "on_tertiary" },
  emoji: { fill: "tertiary_container", ink: "on_tertiary_container" },
}
