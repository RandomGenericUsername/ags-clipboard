// ---------------------------------------------------------------------------
// Pure unit tests for ags-clipboard (stock runner: Node only, no AGS/GTK).
//
// These execute the app's real pure modules:
//   - the non-destructive appearance refresh order;
//   - the clipboard item/parser helpers;
//   - the instance request dispatch.
//
// The palette-refresh transport/idempotence is platform-owned now
// (`createAppearanceRefreshHandler`); the source gate pins the app's wiring.
//
// Run from the repo root:  make test
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAppearance } from "../lib/appearance.ts";
import {
  itemFromPayload,
  matchesQuery,
  parseHistory,
} from "../lib/clipboard-types.ts";
import { handleRequest } from "../lib/requests.ts";

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
