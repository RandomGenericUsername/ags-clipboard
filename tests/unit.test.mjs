// ---------------------------------------------------------------------------
// Pure unit tests for ags-clipboard (stock runner: Node only, no AGS/GTK).
//
// These execute the app's real pure modules:
//   - the non-destructive appearance refresh order;
//   - the clipboard item/parser helpers;
//   - the instance request dispatch.
//
// The appearance-refresh transport/idempotence is platform-owned
// (`createAppearanceRefreshHandler`); these tests execute its v3 generation-
// bound ack, and the source gate pins the app's wiring.
//
// Run from the repo root:  make test
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEARANCE_REFRESH_COMMAND,
  createAppearanceRefreshHandler,
} from "ags-platform/ports/appearance-refresh";
import { applyAppearance } from "../lib/appearance.ts";
import {
  itemFromPayload,
  matchesQuery,
  parseHistory,
} from "../lib/clipboard-types.ts";
import { handleRequest } from "../lib/requests.ts";
import {
  COMPACT_ALIGNMENTS,
  COMPACT_SIZES,
  compactCardWidth,
  compactIsVertical,
  defaultSettings,
  normalizeSettings,
  serializeSettings,
  settingsFor,
} from "../lib/settings.ts";
import { loadSettings, saveSettings } from "../lib/settings-store.ts";
import {
  filterCompactView,
  filterPinnedItems,
  filterRecentItems,
  initialPinFocus,
  itemByKey,
  moveCompactSelection,
  nextCompactView,
  nextPinFocus,
  ordered,
  pinCopyTarget,
  pinnedOrdered,
} from "../lib/card-modes.ts";

const GEN_HASH = "a".repeat(64);

// ── Appearance refresh core ────────────────────────────────────────────────

test("applyAppearance clears caches before rebuilding either widget tree", () => {
  const calls = [];
  applyAppearance({
    clearCaches: () => calls.push("clear"),
    rebuildSearchIcon: () => calls.push("search-icon"),
    rebuildCards: () => calls.push("cards"),
  });
  assert.deepEqual(calls, ["clear", "search-icon", "cards"]);
});

// ── v3 appearance-refresh handler ──────────────────────────────────────────

test("appearance-refresh applies the requested generation and acks that hash", () => {
  const applied = [];
  const responses = [];
  const handler = createAppearanceRefreshHandler(
    {
      applyGeneration(genHash) {
        applied.push(genHash);
        return { status: "applied", genHash };
      },
    },
    () => ({ status: "applied" }),
  );

  handler([APPEARANCE_REFRESH_COMMAND, GEN_HASH], (response) => responses.push(response));

  assert.deepEqual(applied, [GEN_HASH]);
  assert.equal(responses.length, 1);
  assert.deepEqual(JSON.parse(responses[0]), { applied: GEN_HASH });
});

test("the retired palette-refresh command is not a v3 success", () => {
  const responses = [];
  let applies = 0;
  const handler = createAppearanceRefreshHandler(
    {
      applyGeneration(genHash) {
        applies += 1;
        return { status: "applied", genHash };
      },
    },
    () => ({ status: "applied" }),
  );

  handler(["palette-refresh", GEN_HASH], (response) => responses.push(response));

  const response = JSON.parse(responses[0]);
  assert.equal(response.applied, undefined);
  assert.equal(typeof response.failed, "string");
  assert.equal(response.retryable, false);
  assert.equal(applies, 0, "the retired command never applies a generation");
});

// ── Clipboard item helpers ─────────────────────────────────────────────────

test("parseHistory skips malformed records and sorts newest first", () => {
  const items = parseHistory(
    JSON.stringify({
      version: 1,
      items: [
        { hash: "old", kind: "text", timestamp: 1 },
        { hash: "new", kind: "link", timestamp: 5, favorite: true },
        7,
      ],
    }),
  );
  assert.deepEqual(
    items.map((item) => [item.hash, item.kind, item.favorite]),
    [
      ["new", "link", true],
      ["old", "text", false],
    ],
  );
  assert.deepEqual(parseHistory("{ nope"), []);
});

test("live payload maps kinds, image paths and text", () => {
  const image = itemFromPayload({
    type: "image",
    hash: "h",
    path: "/tmp/i.png",
    preview: "",
  });
  assert.deepEqual([image.kind, image.path, image.text], ["image", "/tmp/i.png", null]);

  const text = itemFromPayload({ type: "bogus", hash: "h", path: "", preview: "p" });
  assert.deepEqual([text.kind, text.path, text.text], ["text", null, "p"]);
});

test("matchesQuery is case-insensitive and image-aware", () => {
  const item = {
    hash: "h",
    kind: "text",
    timestamp: 1,
    favorite: false,
    text: "Hello World",
    path: null,
  };
  assert.equal(matchesQuery(item, "hello"), true);
  assert.equal(matchesQuery(item, "zzz"), false);
  assert.equal(matchesQuery({ ...item, kind: "image", text: null }, "IMAG"), true);
});

// ── Instance request dispatch ──────────────────────────────────────────────

function dispatch(argv) {
  const calls = [];
  const responses = [];
  handleRequest(
    argv,
    (response) => responses.push(response),
    {
      show: () => calls.push("show"),
      hide: () => calls.push("hide"),
      toggle: () => calls.push("toggle"),
    },
  );
  return { calls, responses };
}

test("show/hide/toggle/popup-close drive only the window surface", () => {
  assert.deepEqual(dispatch(["toggle"]), { calls: ["toggle"], responses: ["ok"] });
  assert.deepEqual(dispatch(["show"]), { calls: ["show"], responses: ["ok"] });
  assert.deepEqual(dispatch(["hide"]), { calls: ["hide"], responses: ["ok"] });
  assert.deepEqual(dispatch(["popup-close"]), { calls: ["hide"], responses: ["ok"] });
  assert.deepEqual(dispatch(["bogus", "x"]), {
    calls: [],
    responses: ["unknown request: bogus x"],
  });
});

// ── Settings domain (REQ-009) ──────────────────────────────────────────────

const SETTINGS_SHAPE = {
  layout: {
    mode: "full",
    compact: { card_size: "medium", alignment: "bottom" },
  },
};

test("default settings are full / medium / bottom", () => {
  assert.deepEqual(defaultSettings(), SETTINGS_SHAPE);
});

test("unknown, missing and corrupt settings degrade to the defaults", () => {
  assert.deepEqual(normalizeSettings(null), SETTINGS_SHAPE);
  assert.deepEqual(normalizeSettings("nope"), SETTINGS_SHAPE);
  assert.deepEqual(normalizeSettings({ layout: {} }), SETTINGS_SHAPE);
  assert.deepEqual(
    normalizeSettings({ layout: { mode: "sideways", compact: { card_size: 300, alignment: "diagonal" } } }),
    SETTINGS_SHAPE,
  );
  // Each field degrades independently.
  assert.deepEqual(
    normalizeSettings({ layout: { mode: "compact", compact: { card_size: "huge" } } }),
    {
      layout: {
        mode: "compact",
        compact: { card_size: "medium", alignment: "bottom" },
      },
    },
  );
});

test("valid compact settings survive normalization", () => {
  assert.deepEqual(
    normalizeSettings({
      layout: { mode: "compact", compact: { card_size: "large", alignment: "right" } },
    }),
    {
      layout: {
        mode: "compact",
        compact: { card_size: "large", alignment: "right" },
      },
    },
  );
});

test("serializeSettings emits exactly the documented shape", () => {
  assert.equal(
    serializeSettings(settingsFor("compact", "small", "left")),
    '{"layout":{"mode":"compact","compact":{"card_size":"small","alignment":"left"}}}',
  );
  assert.deepEqual(JSON.parse(serializeSettings(defaultSettings())), SETTINGS_SHAPE);
});

test("compact sizes and alignments map to the contract values", () => {
  assert.deepEqual(COMPACT_SIZES, { small: 220, medium: 260, large: 300 });
  assert.deepEqual(COMPACT_ALIGNMENTS, ["bottom", "left", "right"]);
  assert.equal(compactCardWidth("small"), 220);
  assert.equal(compactCardWidth("large"), 300);
  assert.equal(compactIsVertical("left"), true);
  assert.equal(compactIsVertical("right"), true);
  assert.equal(compactIsVertical("bottom"), false);
});

// ── Settings port (pure store) ─────────────────────────────────────────────

function memoryPort(initial = null) {
  let contents = initial;
  return {
    writes: [],
    read() {
      return contents;
    },
    write(text) {
      contents = text;
      this.writes.push(text);
    },
  };
}

test("loadSettings reads a valid document and falls back on absent/corrupt files", () => {
  const valid = memoryPort(
    '{"layout":{"mode":"compact","compact":{"card_size":"small","alignment":"right"}}}',
  );
  assert.deepEqual(loadSettings(valid), {
    layout: {
      mode: "compact",
      compact: { card_size: "small", alignment: "right" },
    },
  });
  assert.deepEqual(loadSettings(memoryPort(null)), SETTINGS_SHAPE);
  assert.deepEqual(loadSettings(memoryPort("")), SETTINGS_SHAPE);
  assert.deepEqual(loadSettings(memoryPort("{ nope")), SETTINGS_SHAPE);
});

test("saveSettings writes the normalized document on change", () => {
  const port = memoryPort();
  const saved = saveSettings(
    port,
    /** deliberately loose input: normalization is the store's job */
    { layout: { mode: "compact", compact: { card_size: "bogus", alignment: "right" } } },
  );
  assert.deepEqual(saved, {
    layout: {
      mode: "compact",
      compact: { card_size: "medium", alignment: "right" },
    },
  });
  assert.equal(port.writes.length, 1);
  assert.deepEqual(JSON.parse(port.writes[0]), saved);
});

// ── Card deck / compact view logic (REQ-009) ───────────────────────────────

function item(hash, kind, timestamp, favorite = false, text = hash) {
  return { hash, kind, timestamp, favorite, text, path: null };
}

const DECK = [
  item("a", "text", 1),
  item("b", "link", 5, true, "https://example.org/gtk4"),
  item("c", "code", 3),
  item("d", "image", 2, true),
];

test("the deck is pinned first, recency order inside each group", () => {
  assert.deepEqual(
    ordered(DECK).map((entry) => entry.hash),
    ["b", "d", "c", "a"],
  );
  assert.deepEqual(
    pinnedOrdered(DECK).map((entry) => entry.hash),
    ["b", "d"],
  );
});

test("recent and pinned views are disjoint filtered lists", () => {
  assert.deepEqual(
    filterRecentItems(DECK, "", "all").map((entry) => entry.hash),
    ["c", "a"],
  );
  assert.deepEqual(
    filterPinnedItems(DECK, "", "all").map((entry) => entry.hash),
    ["b", "d"],
  );
  assert.equal(filterCompactView(DECK, "", "all", "recent").length, 2);
  assert.equal(filterCompactView(DECK, "", "all", "pinned").length, 2);
});

test("query and type filters apply to the active view", () => {
  assert.deepEqual(
    filterRecentItems(DECK, "gtk4", "all").map((entry) => entry.hash),
    [],
  );
  assert.deepEqual(
    filterPinnedItems(DECK, "gtk4", "all").map((entry) => entry.hash),
    ["b"],
  );
  assert.deepEqual(
    filterRecentItems(DECK, "", "code").map((entry) => entry.hash),
    ["c"],
  );
  assert.deepEqual(filterCompactView(DECK, "zzz", "all", "pinned"), []);
});

test("the compact view toggles only when a pin exists", () => {
  assert.equal(nextCompactView("recent", true), "pinned");
  assert.equal(nextCompactView("pinned", true), "recent");
  assert.equal(nextCompactView("recent", false), "recent");
  assert.equal(nextCompactView("pinned", false), "recent");
});

test("compact selection wraps and recovers from a stale key", () => {
  const list = ordered(DECK).filter((entry) => !entry.favorite);
  assert.equal(moveCompactSelection(list, "code:c", 1), "text:a");
  assert.equal(moveCompactSelection(list, "text:a", 1), "code:c");
  assert.equal(moveCompactSelection(list, "code:c", -1), "text:a");
  assert.equal(moveCompactSelection(list, "missing", 1), "code:c");
  assert.equal(moveCompactSelection([], "code:c", 1), null);
});

test("pinned focus starts on the stage card when pinned, else the first pin", () => {
  assert.equal(initialPinFocus(DECK, "image:d"), "image:d");
  assert.equal(initialPinFocus(DECK, "text:a"), "link:b");
  assert.equal(initialPinFocus([item("x", "text", 1)], "text:x"), null);
});

test("pinned focus wraps in both directions and copies only a real pin", () => {
  assert.equal(nextPinFocus(DECK, "link:b", -1), "image:d");
  assert.equal(nextPinFocus(DECK, "image:d", 1), "link:b");
  assert.equal(nextPinFocus(DECK, "missing", 1), "link:b");
  assert.equal(nextPinFocus(DECK, "missing", -1), "image:d");
  assert.equal(pinCopyTarget(DECK, "link:b"), "link:b");
  assert.equal(pinCopyTarget(DECK, "text:a"), null);
  assert.equal(itemByKey(DECK, "image:d"), DECK[3]);
  assert.equal(itemByKey(DECK, "missing"), null);
});
