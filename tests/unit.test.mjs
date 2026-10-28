// ---------------------------------------------------------------------------
// Pure unit tests for ags-clipboard (stock runner: Node only, no AGS/GTK).
//
// These execute the app's real pure modules:
//   - the palette-refresh handler wiring and its JSON-string response;
//   - the appearance refresh order and hash idempotency;
//   - the clipboard item/parser helpers;
//   - the instance request dispatch.
//
// Run from the repo root:  make test
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh";
import {
  applyAppearance,
  createAppearanceRefresh,
} from "../lib/appearance.ts";
import { createClipboardPaletteRefresh } from "../lib/palette-refresh.ts";
import {
  itemFromPayload,
  matchesQuery,
  parseHistory,
} from "../lib/clipboard-types.ts";
import { handleRequest } from "../lib/requests.ts";

const HASH = "appearance-2026-10-27";

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

test("appearance refresh is idempotent by appearance hash", () => {
  let applies = 0;
  const refresh = createAppearanceRefresh(() => {
    applies += 1;
  });

  assert.deepEqual(refresh(HASH), { status: "applied" });
  assert.equal(applies, 1, "first hash applies");

  assert.deepEqual(refresh(HASH), { status: "applied" });
  assert.equal(applies, 1, "the same hash is a safe no-op");

  assert.deepEqual(refresh("appearance-next"), { status: "applied" });
  assert.equal(applies, 2, "a new hash applies again");
});

test("a failed appearance refresh is retried for the same hash", () => {
  let applies = 0;
  const refresh = createAppearanceRefresh(() => {
    applies += 1;
    if (applies === 1) throw new Error("palette not ready");
  });

  assert.throws(() => refresh(HASH), /palette not ready/);
  assert.deepEqual(refresh(HASH), { status: "applied" });
  assert.equal(applies, 2, "the failed hash was not recorded as applied");
});

// ── The real palette-refresh handler ───────────────────────────────────────

test("palette-refresh answers once with the protocol's JSON string", () => {
  const responses = [];
  let applies = 0;
  const handler = createClipboardPaletteRefresh(() => {
    applies += 1;
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 1, "the real refresh ran");
  assert.equal(responses.length, 1, "exactly one response");
  assert.equal(typeof responses[0], "string", "AGS transport is a string");
  assert.equal(responses[0], JSON.stringify({ ok: true }));
});

test("palette-refresh is a no-op for the same hash but still applied", () => {
  const responses = [];
  let applies = 0;
  const handler = createClipboardPaletteRefresh(() => {
    applies += 1;
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));
  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(applies, 1, "same appearance must not rebuild twice");
  assert.deepEqual(responses, [JSON.stringify({ ok: true }), JSON.stringify({ ok: true })]);
});

test("palette-refresh reports a thrown refresh as a retryable failure", () => {
  const responses = [];
  const handler = createClipboardPaletteRefresh(() => {
    throw new Error("theme pointer missing");
  });

  handler([PALETTE_REFRESH_COMMAND, HASH], (response) => responses.push(response));

  assert.equal(responses.length, 1);
  assert.deepEqual(JSON.parse(responses[0]), {
    ok: false,
    error: "theme pointer missing",
    retryable: true,
  });
});

test("a malformed palette-refresh request never runs the refresh", () => {
  const responses = [];
  let applies = 0;
  const handler = createClipboardPaletteRefresh(() => {
    applies += 1;
  });

  handler([PALETTE_REFRESH_COMMAND], (response) => responses.push(response));
  assert.equal(applies, 0);
  assert.equal(responses.length, 1);
  assert.deepEqual(JSON.parse(responses[0]), {
    ok: false,
    error: "malformed palette-refresh request",
    retryable: false,
  });
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
