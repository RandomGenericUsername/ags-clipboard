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

/** The one display-wide content-accent stylesheet (pure string). */
export function contentAccentCss(): string {
  const kinds = Object.keys(TYPE_ACCENT) as ItemKind[]
  return kinds
    .map((kind) => {
      const { fill, ink } = TYPE_ACCENT[kind]
      return `
.kind-${kind} .clipboard-head {
  background-color: @${fill};
  color: @${ink};
}

.clipboard-type-dot.kind-${kind} {
  background-color: @${ink};
}

.clipboard-filter-dot.kind-${kind} {
  background-color: @${fill};
}

.kind-${kind} .clipboard-pin-button {
  background-color: alpha(@${ink}, 0.20);
  border-color: alpha(@${ink}, 0.30);
}

.kind-${kind} .clipboard-pin-button:hover {
  background-color: alpha(@${ink}, 0.34);
}

.kind-${kind} .clipboard-pin-button.is-on {
  background-color: alpha(@${ink}, 0.46);
  border-color: alpha(@${ink}, 0.58);
  box-shadow: inset 0 0 0 1px alpha(@${ink}, 0.35);
}

.kind-${kind}.selected {
  border-color: transparent;
  background-color: alpha(@${fill}, 0.12);
  box-shadow: 0 0 0 2px alpha(@${fill}, 0.65);
}

.kind-${kind}.clipboard-pin-card.focused {
  border-color: transparent;
  box-shadow:
    0 0 0 2px @${fill},
    0 0 0 7px alpha(@${fill}, 0.22),
    0 26px 70px alpha(@shadow, 0.5);
}
`
    })
    .join("\n")
}
