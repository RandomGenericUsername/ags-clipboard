#!/usr/bin/env node
/**
 * REQ-009 mock harness.
 *
 * Two layers:
 *   1. state  — executes the mock's pure CORE block in Node and exercises the
 *               ordering, filtering, deep-link, settings and undo transitions.
 *   2. DOM    — parses mock.html for broken id references, missing deep links,
 *               out-of-date preview affordances and external asset references,
 *               then runs `node --check` over the inline script.
 *
 * Usage: node tickets/REQ-009-clipboard-card-modes/harness.mjs
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MOCK = new URL("./mock.html", import.meta.url);
const html = readFileSync(MOCK, "utf8");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed += 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed += 1;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── state layer ──────────────────────────────────────────────── */

const coreStart = html.indexOf("// CORE-START");
const coreEnd = html.indexOf("// CORE-END");
assert.ok(coreStart > 0 && coreEnd > coreStart, "mock must expose the CORE block");
const coreSource = html.slice(coreStart, coreEnd);
const core = new Function(`${coreSource}\nreturn CORE_EXPORTS;`)();

check("defaults are full / medium", () => {
  assert.deepEqual(core.defaultSettings(), {
    layout: { mode: "full", compact: { card_size: "medium" } },
  });
});

check("settings degrade unknown values to full / medium", () => {
  assert.deepEqual(core.normalizeSettings(null), core.defaultSettings());
  assert.deepEqual(core.normalizeSettings({ layout: { mode: "compact", compact: { card_size: "large" } } }), {
    layout: { mode: "compact", compact: { card_size: "large" } },
  });
  assert.deepEqual(core.normalizeSettings({ layout: { mode: "sideways", compact: { card_size: "huge" } } }), {
    layout: { mode: "full", compact: { card_size: "medium" } },
  });
  assert.deepEqual(core.normalizeSettings({ layout: { compact: { card_size: 300 } } }), {
    layout: { mode: "full", compact: { card_size: "medium" } },
  });
});

check("compact sizes map to 220 / 260 / 300 px", () => {
  assert.deepEqual(core.COMPACT_SIZES, { small: 220, medium: 260, large: 300 });
  assert.equal(core.settingsFor("compact", "large").layout.compact.card_size, "large");
});

check("sample data covers all six kinds and two pins", () => {
  const items = core.sampleItems();
  const kinds = new Set(items.map((item) => item.kind));
  assert.deepEqual([...kinds].sort(), [...core.TYPE_ORDER].sort());
  assert.equal(items.filter((item) => item.pinned).length, 2);
});

check("pinned cards sort first, recency order is stable inside each group", () => {
  const items = core.sampleItems();
  const ordered = core.ordered(items);
  assert.equal(ordered[0].id, "note");
  assert.equal(ordered[1].id, "repo");
  assert.equal(ordered[2].id, "creed");
  assert.equal(ordered.length, items.length);
});

check("compact filter matches type and query", () => {
  const items = core.sampleItems();
  assert.equal(core.filterItems(items, "", "code").length, 2);
  assert.equal(core.filterItems(items, "gtk4", "all").length, 1);
  assert.equal(core.filterItems(items, "orchestrator", "all")[0].id, "note");
  assert.equal(core.filterItems(items, "zzz", "all").length, 0);
});

check("deep-link card resolves by kind and 1-based index", () => {
  const deck = core.ordered(core.sampleItems());
  assert.equal(deck[core.findCardIndex(deck, "code")].id, "placement");
  assert.equal(deck[core.findCardIndex(deck, "5")].id, "screenshot");
  assert.equal(core.findCardIndex(deck, "0"), -1);
  assert.equal(core.findCardIndex(deck, "nope"), -1);
});

check("delete + undo round-trips the exact index", () => {
  const items = core.sampleItems();
  const sourceIndex = items.findIndex((item) => item.id === "placement");
  const removed = core.removeAt(items, sourceIndex);
  assert.equal(removed.item.id, "placement");
  assert.equal(removed.list.length, items.length - 1);
  const restored = core.insertAt(removed.list, removed.index, removed.item);
  assert.deepEqual(restored.map((item) => item.id), items.map((item) => item.id));
});

check("deep links parse all documented keys", () => {
  const deep = core.parseDeepLink(
    "?mode=compact&card=code&pins=1&settings=1&compact_size=large&empty=1&closed=1",
  );
  assert.deepEqual(deep, {
    mode: "compact",
    card: "code",
    pins: true,
    settings: true,
    compactSize: "large",
    empty: true,
    closed: true,
  });
  assert.deepEqual(core.parseDeepLink("?mode=sideways&compact_size=huge"), {});
});

check("pinned focus defaults to the current pin, else the first pin", () => {
  const items = core.sampleItems();
  assert.equal(core.initialPinFocus(items, "repo"), "repo");
  assert.equal(core.initialPinFocus(items, "creed"), "note");
  assert.equal(core.initialPinFocus(items, null), "note");
  assert.equal(core.initialPinFocus([], "note"), null);
});

check("pinned focus wraps left/right and skips nothing", () => {
  const items = core.sampleItems();
  const three = items.map((item) => ({
    ...item,
    pinned: ["note", "placement", "dialog"].includes(item.id),
  }));
  assert.deepEqual(core.pinnedOrdered(three).map((item) => item.id), ["note", "placement", "dialog"]);
  assert.equal(core.nextPinFocus(three, "note", 1), "placement");
  assert.equal(core.nextPinFocus(three, "placement", 1), "dialog");
  assert.equal(core.nextPinFocus(three, "dialog", 1), "note");
  assert.equal(core.nextPinFocus(three, "note", -1), "dialog");
  assert.equal(core.nextPinFocus(three, "dialog", -1), "placement");
  assert.equal(core.nextPinFocus(three, null, 1), "note");
  assert.equal(core.nextPinFocus(three, null, -1), "dialog");
});

check("pinned focus is stable for one pin and empty for none", () => {
  const one = core.sampleItems().filter((item) => item.id === "note");
  assert.equal(core.initialPinFocus(one, null), "note");
  assert.equal(core.nextPinFocus(one, "note", 1), "note");
  assert.equal(core.nextPinFocus(one, "note", -1), "note");
  assert.equal(core.pinOpenTarget(one, "note"), "note");
  assert.equal(core.initialPinFocus([], null), null);
  assert.equal(core.nextPinFocus([], null, 1), null);
  assert.equal(core.pinOpenTarget([], "note"), null);
});

check("pinned focus only opens pinned cards", () => {
  const items = core.sampleItems();
  assert.equal(core.pinOpenTarget(items, "repo"), "repo");
  assert.equal(core.pinOpenTarget(items, "creed"), null);
  assert.equal(core.pinOpenTarget(items, "missing"), null);
});

/* ── DOM / source layer ───────────────────────────────────────── */

check("every $('id') reference exists in the markup", () => {
  const ids = new Set();
  for (const match of html.matchAll(/\$\("([^"]+)"\)/g)) ids.add(match[1]);
  assert.ok(ids.size >= 40, `expected the mock to wire many elements, saw ${ids.size}`);
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

check("the mock has no external assets or network calls", () => {
  assert.ok(!/<link\b/i.test(html), "no <link> tags");
  assert.ok(!/<script[^>]+src=/i.test(html), "no external scripts");
  assert.ok(!/\bsrc\s*=\s*["']https?:/i.test(html), "no remote src");
  assert.ok(!/\bhref\s*=\s*["']https?:/i.test(html), "no remote anchors");
  assert.ok(!/@import\b/i.test(html), "no CSS imports");
  assert.ok(!/url\(\s*["']?https?:/i.test(html), "no remote url()");
  assert.ok(!/\bfetch\s*\(/.test(html), "no fetch");
  assert.ok(!/XMLHttpRequest/.test(html), "no XHR");
});

check("both modes and all settings controls are present", () => {
  for (const token of [
    'id="full"',
    'id="compact"',
    'id="pinsPanel"',
    'id="stageCard"',
    'id="pinsGrid"',
    'id="settingsPop"',
    'id="segLayout"',
    'id="segSize"',
    'data-layout="full"',
    'data-layout="compact"',
    'data-size="small"',
    'data-size="medium"',
    'data-size="large"',
    "← → cards · ↑ pinned · ↓ back",
    "← → select · ↵ open · ↓ back",
    "Click a card to open it in the stage",
    "Pinned · ",
    "$XDG_CONFIG_HOME/clipboard-ui/config.json",
  ]) {
    assert.ok(html.includes(token), `missing ${token}`);
  }
});

check("all six kinds have body renderers and type tokens", () => {
  for (const kind of core.TYPE_ORDER) {
    assert.ok(html.includes(`.kind-${kind}`), `missing kind class ${kind}`);
    assert.ok(html.includes(`b-${kind}`), `missing body class ${kind}`);
  }
});

check("full stage uses the 720 x 460 clamp and compact width variable", () => {
  assert.ok(html.includes("width: clamp(420px, 52vw, 720px)"));
  assert.ok(html.includes("height: clamp(318px, 56vh, 460px)"));
  assert.ok(html.includes("--compact-card-w"));
});

check("inline script passes node --check", () => {
  const start = html.lastIndexOf("<script>");
  const end = html.lastIndexOf("</script>");
  assert.ok(start >= 0 && end > start, "inline script block not found");
  const script = html.slice(start + "<script>".length, end);
  const dir = mkdtempSync(join(tmpdir(), "req009-"));
  const file = join(dir, "mock-script.mjs");
  try {
    writeFileSync(file, script);
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || "node --check failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
