/**
 * Card deck / compact-view logic — pure (no `gi://*`, no DOM).
 *
 * Mirrors the REQ-009 mock's CORE block so the app and the review surface make
 * the same ordering, filtering, view-switch, pinned-focus and selection
 * decisions. Identity is the existing `kind:hash` key from `clipboard-types`.
 */

import {
  itemKey,
  type ClipboardItem,
  type ItemKind,
} from "./clipboard-types.ts"
import type { CompactView } from "./settings.ts"

export type TypeFilter = "all" | ItemKind;

export const TYPE_FILTERS: readonly TypeFilter[] = [
  "all",
  "text",
  "link",
  "code",
  "image",
  "color",
  "emoji",
];

/** The complete deck: pinned cards first, recency order inside each group. */
export function ordered(items: readonly ClipboardItem[]): ClipboardItem[] {
  const byRecency = [...items].sort((a, b) => b.timestamp - a.timestamp)
  return [
    ...byRecency.filter((item) => item.favorite),
    ...byRecency.filter((item) => !item.favorite),
  ]
}

function haystack(item: ClipboardItem, typeLabel: string): string {
  return [item.text ?? "", item.path ?? "", item.kind, typeLabel]
    .join(" ")
    .toLowerCase()
}

const TYPE_LABEL: Record<ItemKind, string> = {
  text: "Text",
  code: "Code",
  color: "Color",
  image: "Image",
  link: "Link",
  emoji: "Emoji",
}

/** Filter the deck by query + type, keeping pinned-first order. */
export function filterItems(
  items: readonly ClipboardItem[],
  query: string,
  filter: TypeFilter = "all",
): ClipboardItem[] {
  const needle = query.trim().toLowerCase()
  return ordered(items).filter((item) => {
    if (filter !== "all" && item.kind !== filter) return false
    if (needle.length === 0) return true
    return haystack(item, TYPE_LABEL[item.kind]).includes(needle)
  })
}

export function filterRecentItems(
  items: readonly ClipboardItem[],
  query: string,
  filter: TypeFilter = "all",
): ClipboardItem[] {
  return filterItems(items, query, filter).filter((item) => !item.favorite)
}

export function filterPinnedItems(
  items: readonly ClipboardItem[],
  query: string,
  filter: TypeFilter = "all",
): ClipboardItem[] {
  return filterItems(items, query, filter).filter((item) => item.favorite)
}

/** The one visible compact list for the active view. */
export function filterCompactView(
  items: readonly ClipboardItem[],
  query: string,
  filter: TypeFilter,
  view: CompactView,
): ClipboardItem[] {
  return view === "pinned"
    ? filterPinnedItems(items, query, filter)
    : filterRecentItems(items, query, filter)
}

/** Toggle Recent/Pinned; with zero pins the view stays Recent. */
export function nextCompactView(
  view: CompactView,
  hasPins: boolean,
): CompactView {
  if (view === "pinned") return "recent"
  return hasPins ? "pinned" : "recent"
}

/**
 * Move the compact selection by `delta` with wrap-around. Returns the next
 * key, or `null` for an empty list.
 */
export function moveCompactSelection(
  list: readonly ClipboardItem[],
  selectedKey: string | null,
  delta: number,
): string | null {
  if (list.length === 0) return null
  let index = list.findIndex((item) => itemKey(item) === selectedKey)
  if (index < 0) return itemKey(list[0])
  index = ((index + delta) % list.length + list.length) % list.length
  return itemKey(list[index])
}

/** Pinned cards in deck order (pinned-first, recency inside the group). */
export function pinnedOrdered(items: readonly ClipboardItem[]): ClipboardItem[] {
  return ordered(items).filter((item) => item.favorite)
}

/**
 * The focused pin when the grid opens: the current stage card when it is
 * pinned, otherwise the first pin.
 */
export function initialPinFocus(
  items: readonly ClipboardItem[],
  selectedKey: string | null,
): string | null {
  const pinned = pinnedOrdered(items)
  if (pinned.length === 0) return null
  if (pinned.some((item) => itemKey(item) === selectedKey)) return selectedKey
  return itemKey(pinned[0])
}

/** Move the pinned-grid focus with wrap-around. */
export function nextPinFocus(
  items: readonly ClipboardItem[],
  focusedKey: string | null,
  delta: number,
): string | null {
  const pinned = pinnedOrdered(items)
  if (pinned.length === 0) return null
  let index = pinned.findIndex((item) => itemKey(item) === focusedKey)
  if (index < 0) {
    return itemKey(pinned[delta < 0 ? pinned.length - 1 : 0])
  }
  index = (index + delta + pinned.length) % pinned.length
  return itemKey(pinned[index])
}

/** The pin Enter/click copies; `null` when the key is not a pin. */
export function pinCopyTarget(
  items: readonly ClipboardItem[],
  focusedKey: string | null,
): string | null {
  return pinnedOrdered(items).some((item) => itemKey(item) === focusedKey)
    ? focusedKey
    : null
}

/** Find an item by its `kind:hash` key. */
export function itemByKey(
  items: readonly ClipboardItem[],
  key: string | null,
): ClipboardItem | null {
  if (key === null) return null
  return items.find((item) => itemKey(item) === key) ?? null
}
