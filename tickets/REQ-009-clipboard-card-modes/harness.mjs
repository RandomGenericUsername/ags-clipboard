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

check("defaults are full / medium / bottom", () => {
  assert.deepEqual(core.defaultSettings(), {
    layout: { mode: "full", compact: { card_size: "medium", alignment: "bottom" } },
  });
});

check("settings degrade unknown values to full / medium / bottom", () => {
  assert.deepEqual(core.normalizeSettings(null), core.defaultSettings());
  assert.deepEqual(core.normalizeSettings({ layout: { mode: "compact", compact: { card_size: "large", alignment: "left" } } }), {
    layout: { mode: "compact", compact: { card_size: "large", alignment: "left" } },
  });
  assert.deepEqual(core.normalizeSettings({ layout: { mode: "sideways", compact: { card_size: "huge", alignment: "diagonal" } } }), {
    layout: { mode: "full", compact: { card_size: "medium", alignment: "bottom" } },
  });
  assert.deepEqual(core.normalizeSettings({ layout: { compact: { card_size: 300 } } }), {
    layout: { mode: "full", compact: { card_size: "medium", alignment: "bottom" } },
  });
});

check("compact sizes and alignments map to their contract values", () => {
  assert.deepEqual(core.COMPACT_SIZES, { small: 220, medium: 260, large: 300 });
  assert.deepEqual(core.COMPACT_ALIGNMENTS, ["bottom", "left", "right"]);
  assert.equal(core.settingsFor("compact", "large", "right").layout.compact.card_size, "large");
  assert.equal(core.settingsFor("compact", "large", "right").layout.compact.alignment, "right");
  assert.equal(core.compactIsVertical("left"), true);
  assert.equal(core.compactIsVertical("right"), true);
  assert.equal(core.compactIsVertical("bottom"), false);
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

check("recent and pinned views are disjoint filtered lists", () => {
  const items = core.sampleItems();
  const recent = core.filterRecentItems(items, "", "all");
  assert.deepEqual(recent.map((item) => item.id), [
    "creed", "placement", "screenshot", "accent", "rocket",
    "rules", "setcmd", "preview", "gtk", "dialog",
  ]);
  assert.deepEqual(core.filterPinnedItems(items, "", "all").map((item) => item.id), ["note", "repo"]);
  assert.equal(core.filterRecentItems(items, "github", "all").length, 0);
  assert.equal(core.filterRecentItems(items, "gtk4", "all")[0].id, "gtk");
  assert.equal(core.filterRecentItems(items, "", "link").length, 1);
  assert.equal(core.filterPinnedItems(items, "", "link")[0].id, "repo");
  assert.equal(core.filterPinnedItems(items, "orchestrator", "all")[0].id, "note");
  assert.equal(core.filterPinnedItems(items, "zzz", "all").length, 0);
  assert.deepEqual(core.filterCompactView(items, "", "all", "recent"), recent);
  assert.deepEqual(core.filterCompactView(items, "", "all", "pinned"), core.filterPinnedItems(items, "", "all"));
  assert.equal(core.filterCompactView([], "", "all", "recent").length, 0);
  assert.equal(core.filterCompactView([], "", "all", "pinned").length, 0);
});

check("active-view selection moves with clamping", () => {
  const recent = core.filterRecentItems(core.sampleItems(), "", "all");
  assert.equal(core.moveCompactSelection(recent, "creed", 1), "placement");
  assert.equal(core.moveCompactSelection(recent, "placement", -1), "creed");
  assert.equal(core.moveCompactSelection(recent, "dialog", 1), "dialog");
  assert.equal(core.moveCompactSelection(recent, "creed", -1), "creed");
  assert.equal(core.moveCompactSelection(recent, null, 1), "creed");
  assert.equal(core.moveCompactSelection([], "creed", 1), null);
  const pinned = core.filterPinnedItems(core.sampleItems(), "", "all");
  assert.equal(core.moveCompactSelection(pinned, "note", 1), "repo");
  assert.equal(core.moveCompactSelection(pinned, "repo", 1), "repo");
});

check("next compact view toggles and respects zero pins", () => {
  assert.equal(core.nextCompactView("recent", true), "pinned");
  assert.equal(core.nextCompactView("pinned", true), "recent");
  assert.equal(core.nextCompactView("recent", false), "recent");
  assert.equal(core.nextCompactView("pinned", false), "recent");
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
    "?mode=compact&card=code&pins=1&settings=1&compact_size=large&compact_align=left&compact_view=pinned&empty=1&closed=1",
  );
  assert.deepEqual(deep, {
    mode: "compact",
    card: "code",
    pins: true,
    settings: true,
    compactSize: "large",
    compactAlign: "left",
    compactView: "pinned",
    empty: true,
    closed: true,
  });
  assert.deepEqual(core.parseDeepLink("?mode=sideways&compact_size=huge&compact_align=diagonal&compact_view=other"), {});
  assert.deepEqual(core.COMPACT_VIEWS, ["recent", "pinned"]);
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
  assert.equal(core.pinCopyTarget(one, "note"), "note");
  assert.equal(core.initialPinFocus([], null), null);
  assert.equal(core.nextPinFocus([], null, 1), null);
  assert.equal(core.pinCopyTarget([], "note"), null);
});

check("pinned focus only copies pinned cards", () => {
  const items = core.sampleItems();
  assert.equal(core.pinCopyTarget(items, "repo"), "repo");
  assert.equal(core.pinCopyTarget(items, "creed"), null);
  assert.equal(core.pinCopyTarget(items, "missing"), null);
});

check("pinned selection copies and collapses the overlay, not the stage", () => {
  const start = html.indexOf("function copyFocusedPin");
  const end = html.indexOf("\nfunction openPins", start);
  assert.ok(start > 0 && end > start, "copyFocusedPin must exist");
  const body = html.slice(start, end);
  assert.match(body, /copyItem\(item\)/, "must copy the pinned item");
  assert.match(body, /closeOverlay\(\)/, "must collapse the whole overlay");
  assert.doesNotMatch(body, /selectById/, "must not switch the stage card");
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
    'id="cViewBar"',
    'id="cRecentTab"',
    'id="cPinnedTab"',
    'data-view="recent"',
    'data-view="pinned"',
    'id="cUp"',
    'id="cDown"',
    'id="settingsPop"',
    'id="segLayout"',
    'id="segSize"',
    'id="segAlign"',
    'data-layout="full"',
    'data-layout="compact"',
    'data-size="small"',
    'data-size="medium"',
    'data-size="large"',
    'data-align="bottom"',
    'data-align="left"',
    'data-align="right"',
    "Compact alignment",
    "compact_align",
    "compact_view",
    "← → cards · ↑ pinned · ↓ back",
    "← → select · ↵ copy · ↓ back",
    "Click a card to copy it",
    "Pinned · ",
    "$XDG_CONFIG_HOME/clipboard-ui/config.json",
  ]) {
    assert.ok(html.includes(token), `missing ${token}`);
  }
});

check("compact view switch replaces one carousel and never keeps a shelf", () => {
  assert.ok(!html.includes("cPinnedList"), "no pinned shelf list");
  assert.ok(!html.includes("c-pin-card"), "no pinned shelf cards");
  assert.ok(!html.includes("quickCopyPinned"), "no quick-copy path");
  const start = html.indexOf("function renderCompact");
  const end = html.indexOf("\nfunction renderAll", start);
  assert.ok(start > 0 && end > start, "renderCompact must exist");
  const body = html.slice(start, end);
  assert.match(body, /compactView/);
  assert.match(body, /el\.cPinnedTab\.hidden = pinnedTotal === 0/);
  assert.match(body, /el\.cList\.innerHTML/);
  const switchStart = html.indexOf("function setCompactView");
  const switchEnd = html.indexOf("\nfunction selectById", switchStart);
  assert.ok(switchStart > 0 && switchEnd > switchStart, "setCompactView must exist");
  const switchBody = html.slice(switchStart, switchEnd);
  assert.match(switchBody, /compactView = next/);
  assert.doesNotMatch(switchBody, /localStorage|saveSettings/);
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

/* ── browser interaction layer ────────────────────────────────── */

function findChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium"].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/") && existsSync(candidate)) return candidate;
    const result = spawnSync("which", [candidate], { encoding: "utf8" });
    if (result.status === 0) return result.stdout.trim();
  }
  return null;
}

async function runDomChecks(chrome) {
  const profile = mkdtempSync(join(tmpdir(), "req009-profile-"));
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--window-size=1600,1000",
    `${MOCK.href}?mode=compact`,
  ], { stdio: "ignore" });

  let ws = null;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    let port = 0;
    for (let i = 0; i < 120 && !port; i += 1) {
      if (existsSync(portFile)) {
        port = Number(readFileSync(portFile, "utf8").trim().split(/\r?\n/)[0]) || 0;
      }
      if (!port) await sleep(100);
    }
    assert.ok(port, "Chrome did not expose a DevTools port");

    let page = null;
    for (let i = 0; i < 80 && !page; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        const pages = await response.json();
        page = pages.find((entry) => entry.type === "page" && entry.url.includes("mock.html"))
          || pages.find((entry) => entry.type === "page")
          || null;
      } catch {
        /* Chrome is still starting. */
      }
      if (!page) await sleep(100);
    }
    assert.ok(page, "Chrome did not expose a page target");

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("DevTools websocket failed"));
    });

    let sequence = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    };

    function send(method, params = {}) {
      sequence += 1;
      const id = sequence;
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out`));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
      });
      ws.send(JSON.stringify({ id, method, params }));
      return promise;
    }

    async function evaluate(expression) {
      const response = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      const details = response.result && response.result.exceptionDetails;
      if (details) {
        throw new Error((details.exception && details.exception.description) || details.text || "page exception");
      }
      return response.result && response.result.result ? response.result.result.value : undefined;
    }

    async function waitFor(expression, label) {
      for (let i = 0; i < 80; i += 1) {
        try {
          if (await evaluate(expression)) return;
        } catch {
          /* document is navigating */
        }
        await sleep(100);
      }
      throw new Error(`timed out waiting for ${label}`);
    }

    const press = (key) => evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }))`);
    const pressEvent = (key, opts = {}, selector = null) => evaluate(`(() => {
      const target = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : "document"};
      const event = new KeyboardEvent("keydown", {
        key: ${JSON.stringify(key)},
        bubbles: true,
        cancelable: true,
        shiftKey: ${Boolean(opts.shiftKey)},
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    })()`);
    const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

    const readCompact = () => evaluate(`(() => {
      const panel = document.getElementById("compact");
      const rect = panel.getBoundingClientRect();
      return {
        classes: document.body.className,
        align: document.body.dataset.compactAlign,
        size: document.body.dataset.compactSize,
        view: compactView,
        viewBarHidden: document.getElementById("cViewBar").hidden,
        recentActive: document.getElementById("cRecentTab").classList.contains("is-active"),
        pinnedActive: document.getElementById("cPinnedTab").classList.contains("is-active"),
        pinnedHidden: document.getElementById("cPinnedTab").hidden,
        pinnedDisabled: document.getElementById("cPinnedTab").disabled,
        pinnedLabel: document.getElementById("cPinnedTab").textContent,
        cards: [...document.querySelectorAll("#cList .c-card")].map((card) => card.dataset.id),
        pinnedTotal: items.filter((item) => item.pinned).length,
        recentTotal: items.filter((item) => !item.pinned).length,
        selected: selectedId,
        upHidden: document.getElementById("cUp").hidden,
        downHidden: document.getElementById("cDown").hidden,
        prevHidden: document.getElementById("cPrev").hidden,
        nextHidden: document.getElementById("cNext").hidden,
        status: document.getElementById("cStatus").textContent,
        scrollTop: document.getElementById("cList").scrollTop,
        scrollLeft: document.getElementById("cList").scrollLeft,
        overflow: panel.scrollHeight > panel.clientHeight + 1,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    })()`);

    const setSearch = (value) => evaluate(`document.getElementById("cSearch").value = ${JSON.stringify(value)};
      document.getElementById("cSearch").dispatchEvent(new Event("input", { bubbles: true }))`);
    const setFilter = (value) => evaluate(`document.querySelector(${JSON.stringify(`#cFilters [data-filter="${value}"]`)}).click()`);
    const pressCtrl = (key) => evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, ctrlKey: true, bubbles: true }))`);

    const resetSample = async () => {
      await evaluate(`items = sampleItems(); compactView = "recent"; selectedId = "creed"; query = ""; filter = "all";
        document.getElementById("cSearch").value = ""; setMode("compact"); setCompactAlign("bottom");
        renderAll()`);
      await sleep(120);
    };

    await waitFor(`Boolean(document.getElementById("cViewBar")) && Boolean(document.getElementById("cList").children.length)`, "compact boot");

    await checkAsync("bottom recent view: non-pinned carousel with Pinned tab", async () => {
      await resetSample();
      const state = await readCompact();
      assert.equal(state.align, "bottom");
      assert.equal(state.view, "recent");
      assert.equal(state.viewBarHidden, false);
      assert.equal(state.recentActive, true);
      assert.equal(state.pinnedActive, false);
      assert.equal(state.pinnedHidden, false);
      assert.equal(state.pinnedDisabled, false);
      assert.equal(state.pinnedLabel, "Pinned (2)");
      assert.equal(state.cards.length, 10);
      assert.equal(state.cards.includes("note"), false);
      assert.equal(state.cards.includes("repo"), false);
      assert.equal(state.cards[0], "creed");
      assert.equal(state.pinnedTotal, 2);
      assert.equal(state.status, "10 recent");
      assert.equal(state.upHidden, true);
      assert.equal(state.downHidden, true);
      assert.equal(state.prevHidden, false);
      assert.equal(state.nextHidden, false);
      assert.equal(state.rect.left, 0);
      assert.equal(state.rect.right, state.viewport.width);
      assert.equal(state.rect.bottom, state.viewport.height);
      assert.equal(state.overflow, false);
    });

    await checkAsync("bottom pinned view replaces the carousel without a height jump", async () => {
      const before = await readCompact();
      await click("#cPinnedTab");
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(state.pinnedActive, true);
      assert.equal(state.recentActive, false);
      assert.deepEqual(state.cards, ["note", "repo"]);
      assert.equal(state.selected, "note");
      assert.equal(state.status, "2 pinned");
      assert.equal(state.rect.height, before.rect.height);
      assert.equal(state.rect.top, before.rect.top);
      const closed = await evaluate(`document.body.classList.contains("is-closed")`);
      assert.equal(closed, false);
      const toast = await evaluate(`document.getElementById("toast").textContent`);
      assert.doesNotMatch(toast, /Copied/);
    });

    await checkAsync("left compact: full-height column, view persists, no height jump", async () => {
      await evaluate(`setCompactAlign("left")`);
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.align, "left");
      assert.equal(state.view, "pinned");
      assert.equal(state.rect.left, 12);
      assert.equal(state.rect.top, 52);
      assert.equal(state.rect.bottom, state.viewport.height - 12);
      assert.equal(state.rect.width, 288);
      assert.equal(state.rect.height, state.viewport.height - 64);
      assert.equal(state.upHidden, false);
      assert.equal(state.downHidden, false);
      assert.equal(state.prevHidden, true);
      assert.equal(state.nextHidden, true);
      assert.deepEqual(state.cards, ["note", "repo"]);
      const pinnedHeight = state.rect.height;
      await click("#cRecentTab");
      await sleep(160);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.cards.length, 10);
      assert.equal(state.rect.height, pinnedHeight);
      await click("#cPinnedTab");
      await sleep(160);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(state.rect.height, pinnedHeight);
    });

    await checkAsync("right compact mirrors the column and keeps the pinned view", async () => {
      await evaluate(`setCompactAlign("right")`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.align, "right");
      assert.equal(state.view, "pinned");
      assert.equal(state.rect.right, 1588);
      assert.equal(state.rect.left, 1300);
      assert.equal(state.rect.top, 52);
      assert.equal(state.rect.bottom, state.viewport.height - 12);
      assert.equal(state.rect.width, 288);
      assert.deepEqual(state.cards, ["note", "repo"]);
    });

    await checkAsync("vertical up/down navigation follows the active view", async () => {
      await evaluate(`setCompactAlign("left")`);
      await sleep(160);
      await click("#cRecentTab");
      await sleep(140);
      let state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.selected, "creed");
      await press("ArrowDown");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "placement");
      await press("ArrowUp");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "creed");
      await click("#cDown");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "placement");
      await click("#cUp");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "creed");

      await click("#cPinnedTab");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(state.selected, "note");
      await press("ArrowDown");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "repo");
      await press("ArrowUp");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "note");
    });

    await checkAsync("filters and search apply to the active view and survive switching", async () => {
      await click("#cPinnedTab");
      await sleep(140);
      await setSearch("github");
      await sleep(140);
      let state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.deepEqual(state.cards, ["repo"]);
      assert.equal(state.status, "1 pinned");
      await click("#cRecentTab");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.deepEqual(state.cards, []);
      const emptyText = await evaluate(`document.querySelector("#cList .c-empty").textContent`);
      assert.match(emptyText, /No recent matches/);
      assert.equal(await evaluate(`document.getElementById("cSearch").value`), "github");
      await click("#cPinnedTab");
      await sleep(140);
      state = await readCompact();
      assert.deepEqual(state.cards, ["repo"]);

      await setSearch("");
      await setFilter("link");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.deepEqual(state.cards, ["repo"]);
      await click("#cRecentTab");
      await sleep(140);
      state = await readCompact();
      assert.deepEqual(state.cards, ["gtk"]);
      assert.equal(await evaluate(`document.querySelector("#cFilters .chip.selected").dataset.filter`), "link");

      await click("#cPinnedTab");
      await sleep(140);
      await setSearch("zzz");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.deepEqual(state.cards, []);
      const pinnedEmpty = await evaluate(`document.querySelector("#cList .c-empty").textContent`);
      assert.match(pinnedEmpty, /No pinned matches/);
      assert.equal(state.pinnedHidden, false);
    });

    await checkAsync("Ctrl+1..9 addresses the active view", async () => {
      await resetSample();
      await evaluate(`setCompactAlign("left")`);
      await sleep(140);
      await click("#cPinnedTab");
      await sleep(140);
      await pressCtrl("2");
      await sleep(120);
      let toast = await evaluate(`document.getElementById("toast").textContent`);
      assert.match(toast, /Copied link card/);
      let closed = await evaluate(`document.body.classList.contains("is-closed")`);
      assert.equal(closed, false);
      await click("#cRecentTab");
      await sleep(140);
      await pressCtrl("2");
      await sleep(120);
      toast = await evaluate(`document.getElementById("toast").textContent`);
      assert.match(toast, /Copied code card/);
      closed = await evaluate(`document.body.classList.contains("is-closed")`);
      assert.equal(closed, false);
    });

    await checkAsync("Tab / Shift+Tab toggle the view and prevent compact traversal", async () => {
      await resetSample();
      let prevented = await pressEvent("Tab");
      await sleep(140);
      let state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "pinned");
      assert.equal(state.pinnedActive, true);
      assert.equal(state.selected, "note");
      const hint = await evaluate(`document.getElementById("cHints").textContent`);
      assert.match(hint, /↑↓ view/);
      assert.match(hint, /Tab view/);
      prevented = await pressEvent("Tab", { shiftKey: true });
      await sleep(140);
      state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "recent");
      assert.equal(state.recentActive, true);
      assert.equal(state.selected, "creed");
    });

    await checkAsync("bottom up/down toggle the view; left/right still move cards", async () => {
      await resetSample();
      let prevented = await pressEvent("ArrowDown");
      await sleep(140);
      let state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "pinned");
      assert.equal(state.selected, "note");
      prevented = await pressEvent("ArrowUp");
      await sleep(140);
      state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "recent");
      assert.equal(state.selected, "creed");
      await pressEvent("ArrowRight");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.selected, "placement");
      await pressEvent("ArrowLeft");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.selected, "creed");

      await evaluate(`document.getElementById("cSearch").focus()`);
      await pressEvent("ArrowDown", {}, "#cSearch");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(await evaluate(`document.activeElement.id`), "cSearch");
      await pressEvent("ArrowUp", {}, "#cSearch");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(await evaluate(`document.activeElement.id`), "cSearch");
      await evaluate(`document.getElementById("cSearch").blur()`);
    });

    await checkAsync("vertical left/right toggle the view unless search is focused", async () => {
      await resetSample();
      await evaluate(`setCompactAlign("left"); document.getElementById("cSearch").blur()`);
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.view, "recent");
      let hint = await evaluate(`document.getElementById("cHints").textContent`);
      assert.match(hint, /←→ view/);
      assert.match(hint, /Tab view/);
      let prevented = await pressEvent("ArrowRight");
      await sleep(140);
      state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "pinned");
      await pressEvent("ArrowRight");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "recent");
      await pressEvent("ArrowLeft");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      await pressEvent("ArrowLeft");
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "recent");

      await evaluate(`(() => {
        const search = document.getElementById("cSearch");
        search.focus();
        search.value = "abcdef";
        search.setSelectionRange(2, 2);
      })()`);
      await sleep(80);
      hint = await evaluate(`document.getElementById("cHints").textContent`);
      assert.match(hint, /Tab view/);
      assert.doesNotMatch(hint, /←→ view/);
      prevented = await pressEvent("ArrowRight", {}, "#cSearch");
      await sleep(120);
      state = await readCompact();
      assert.equal(prevented, false);
      assert.equal(state.view, "recent");
      assert.equal(await evaluate(`document.activeElement.id`), "cSearch");
      assert.equal(await evaluate(`document.getElementById("cSearch").value`), "abcdef");
      prevented = await pressEvent("ArrowLeft", {}, "#cSearch");
      await sleep(120);
      state = await readCompact();
      assert.equal(prevented, false);
      assert.equal(state.view, "recent");
      prevented = await pressEvent("Tab", {}, "#cSearch");
      await sleep(140);
      state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "pinned");
      assert.equal(await evaluate(`document.activeElement.id`), "cSearch");
      prevented = await pressEvent("Tab", { shiftKey: true }, "#cSearch");
      await sleep(140);
      state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "recent");
      await evaluate(`document.getElementById("cSearch").blur()`);
    });

    await checkAsync("query and filter survive view toggles", async () => {
      await resetSample();
      await setSearch("https");
      await setFilter("link");
      await sleep(140);
      await evaluate(`selectById("gtk")`);
      await sleep(120);
      await pressEvent("Tab");
      await sleep(140);
      let state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.deepEqual(state.cards, ["repo"]);
      assert.equal(state.selected, "repo");
      assert.equal(await evaluate(`document.getElementById("cSearch").value`), "https");
      assert.equal(await evaluate(`document.querySelector("#cFilters .chip.selected").dataset.filter`), "link");
      await pressEvent("Tab", { shiftKey: true });
      await sleep(140);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.deepEqual(state.cards, ["gtk"]);
      assert.equal(state.selected, "gtk");
      assert.equal(await evaluate(`document.getElementById("cSearch").value`), "https");
    });

    await checkAsync("zero pins makes keyboard view switching a no-op", async () => {
      await evaluate(`items = sampleItems().map((item) => ({ ...item, pinned: false }));
        compactView = "recent"; selectedId = items[0].id; query = ""; filter = "all";
        document.getElementById("cSearch").value = ""; renderAll()`);
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.pinnedHidden, true);
      assert.equal(state.view, "recent");
      let prevented = await pressEvent("Tab");
      await sleep(120);
      state = await readCompact();
      assert.equal(prevented, true);
      assert.equal(state.view, "recent");
      await pressEvent("ArrowDown");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.view, "recent");
      await evaluate(`setCompactAlign("left")`);
      await sleep(140);
      await pressEvent("ArrowRight");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.view, "recent");
      const hint = await evaluate(`document.getElementById("cHints").textContent`);
      assert.doesNotMatch(hint, /view/);
    });

    await checkAsync("full mode keeps its own up/down and Tab traversal", async () => {
      await resetSample();
      await evaluate(`setMode("full")`);
      await sleep(140);
      let prevented = await pressEvent("ArrowUp");
      await sleep(140);
      assert.equal(prevented, true);
      assert.equal(await evaluate("pinsOpen"), true);
      assert.equal(await evaluate("compactView"), "recent");
      await pressEvent("Escape");
      await sleep(120);
      assert.equal(await evaluate("pinsOpen"), false);
      prevented = await pressEvent("Tab");
      await sleep(120);
      assert.equal(prevented, false);
      assert.equal(await evaluate("compactView"), "recent");
      await evaluate(`setMode("compact")`);
      await sleep(140);
    });

    await checkAsync("settings rows disable in Full and enable in Compact", async () => {
      await evaluate(`setCompactAlign("left"); openSettings(document.getElementById("cGear"))`);
      await sleep(150);
      let state = await evaluate(`({
        sizeDisabled: [...document.querySelectorAll("#segSize button")].every((button) => button.disabled),
        alignDisabled: [...document.querySelectorAll("#segAlign button")].every((button) => button.disabled),
        sizeRowDisabled: document.getElementById("sizeRow").classList.contains("is-disabled"),
        alignRowDisabled: document.getElementById("alignRow").classList.contains("is-disabled"),
      })`);
      assert.equal(state.sizeDisabled, false);
      assert.equal(state.alignDisabled, false);
      assert.equal(state.sizeRowDisabled, false);
      assert.equal(state.alignRowDisabled, false);
      await evaluate(`document.querySelector('#segAlign [data-align="left"]').click()`);
      await sleep(180);
      let alignState = await readCompact();
      assert.equal(alignState.align, "left");
      assert.equal(alignState.rect.left, 12);
      const selectedAlign = await evaluate(`document.querySelector("#segAlign .selected").dataset.align`);
      assert.equal(selectedAlign, "left");
      await evaluate(`document.querySelector('#segAlign [data-align="bottom"]').click()`);
      await sleep(180);
      await evaluate(`document.querySelector('[data-layout="full"]').click()`);
      await sleep(160);
      state = await evaluate(`({
        mode: document.body.className,
        sizeDisabled: [...document.querySelectorAll("#segSize button")].every((button) => button.disabled),
        alignDisabled: [...document.querySelectorAll("#segAlign button")].every((button) => button.disabled),
        sizeRowDisabled: document.getElementById("sizeRow").classList.contains("is-disabled"),
        alignRowDisabled: document.getElementById("alignRow").classList.contains("is-disabled"),
      })`);
      assert.match(state.mode, /mode-full/);
      assert.equal(state.sizeDisabled, true);
      assert.equal(state.alignDisabled, true);
      assert.equal(state.sizeRowDisabled, true);
      assert.equal(state.alignRowDisabled, true);
      await evaluate(`document.querySelector('[data-layout="compact"]').click()`);
      await sleep(160);
      state = await evaluate(`({
        mode: document.body.className,
        sizeDisabled: [...document.querySelectorAll("#segSize button")].every((button) => button.disabled),
        alignDisabled: [...document.querySelectorAll("#segAlign button")].every((button) => button.disabled),
      })`);
      assert.match(state.mode, /mode-compact/);
      assert.equal(state.sizeDisabled, false);
      assert.equal(state.alignDisabled, false);
      await evaluate("closeSettings()");
    });

    await checkAsync("alignment preserves query, filter and selection and persists", async () => {
      await evaluate(`query = "gtk4"; filter = "link"; document.getElementById("cSearch").value = query; compactView = "recent";
        selectById("gtk"); setCompactAlign("left")`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.align, "left");
      assert.equal(state.view, "recent");
      assert.equal(state.selected, "gtk");
      assert.deepEqual(state.cards, ["gtk"]);
      assert.equal(state.pinnedLabel, "Pinned (2)");
      const stored = await evaluate(`JSON.parse(localStorage.getItem("clipboard-ui.settings"))`);
      assert.equal(stored.layout.mode, "compact");
      assert.equal(stored.layout.compact.alignment, "left");
      assert.equal(stored.layout.compact.card_size, "medium");
      assert.equal("view" in stored.layout.compact, false);
    });

    await checkAsync("zero pins hides/disables the Pinned tab and forces Recent", async () => {
      await evaluate(`compactView = "pinned"; query = ""; filter = "all"; document.getElementById("cSearch").value = "";
        items = sampleItems().map((item) => ({ ...item, pinned: false })); selectedId = items[0].id;
        renderAll()`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.pinnedHidden, true);
      assert.equal(state.pinnedDisabled, true);
      assert.equal(state.pinnedLabel, "Pinned (0)");
      assert.equal(state.recentActive, true);
      assert.equal(state.cards.length, 12);
      assert.equal(state.viewBarHidden, false);
    });

    await checkAsync("single pin is available and uses the normal compact card interaction", async () => {
      await evaluate(`items = sampleItems(); items.forEach((item) => { item.pinned = item.id === "note"; });
        compactView = "recent"; selectedId = "creed"; query = ""; filter = "all"; renderAll()`);
      await sleep(160);
      await click("#cPinnedTab");
      await sleep(140);
      let state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(state.pinnedLabel, "Pinned (1)");
      assert.deepEqual(state.cards, ["note"]);
      assert.equal(state.selected, "note");
      await press("Enter");
      await sleep(120);
      let closed = await evaluate(`document.body.classList.contains("is-closed")`);
      let toast = await evaluate(`document.getElementById("toast").textContent`);
      assert.equal(closed, false);
      assert.match(toast, /Copied text card/);
      await evaluate(`document.querySelector("#cList .c-card").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`);
      await sleep(120);
      closed = await evaluate(`document.body.classList.contains("is-closed")`);
      assert.equal(closed, false);

      await click("#cRecentTab");
      await sleep(140);
      await evaluate(`document.querySelector("#cList .c-card").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`);
      await sleep(120);
      closed = await evaluate(`document.body.classList.contains("is-closed")`);
      assert.equal(closed, false);
    });

    await checkAsync("vertical strip scrolls the active view without a height jump", async () => {
      await evaluate(`items = Array.from({ length: 26 }, (_, index) => ({
          ...sampleItems()[index % 12],
          id: "scroll-" + index,
          pinned: index < 8,
        })); compactView = "recent"; selectedId = "scroll-25"; query = ""; filter = "all";
        setCompactAlign("left"); renderAll(); selectById("scroll-25", { scroll: true })`);
      await sleep(500);
      let state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.cards.length, 18);
      assert.equal(state.selected, "scroll-25");
      assert.ok(state.scrollTop > 0, `recent list scrollTop was ${state.scrollTop}`);
      const recentHeight = state.rect.height;
      await click("#cPinnedTab");
      await sleep(200);
      await evaluate(`selectById("scroll-7", { scroll: true })`);
      await sleep(500);
      state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(state.cards.length, 8);
      assert.equal(state.selected, "scroll-7");
      assert.ok(state.scrollTop > 0, `pinned list scrollTop was ${state.scrollTop}`);
      assert.equal(state.rect.height, recentHeight);
    });

    await checkAsync("deep links select the pinned view and preserve alignment/size", async () => {
      await send("Page.navigate", { url: `${MOCK.href}?mode=compact&compact_view=pinned` });
      await waitFor(`compactView === "pinned" && !document.getElementById("compact").hidden`, "compact view deep link");
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.view, "pinned");
      assert.equal(state.pinnedActive, true);
      assert.deepEqual(state.cards, ["note", "repo"]);
      assert.equal(state.selected, "note");

      await send("Page.navigate", { url: `${MOCK.href}?mode=compact&compact_align=left&compact_view=pinned&compact_size=large` });
      await waitFor(`document.body.dataset.compactAlign === "left" && document.body.dataset.compactSize === "large" && compactView === "pinned"`, "compact pinned left/large deep link");
      await sleep(160);
      state = await readCompact();
      assert.equal(state.align, "left");
      assert.equal(state.size, "large");
      assert.equal(state.view, "pinned");
      assert.equal(state.rect.width, 328);
      assert.equal(state.rect.left, 12);
      assert.deepEqual(state.cards, ["note", "repo"]);
      const height = state.rect.height;
      await click("#cRecentTab");
      await sleep(160);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.rect.height, height);
    });

    await checkAsync("view is not persisted and resets to Recent on reopen", async () => {
      await send("Page.navigate", { url: `${MOCK.href}?mode=compact` });
      await waitFor(`compactView === "recent" && !document.getElementById("compact").hidden`, "recent default after reload");
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.view, "recent");
      const stored = await evaluate(`JSON.parse(localStorage.getItem("clipboard-ui.settings"))`);
      assert.equal("view" in stored.layout.compact, false);
      await click("#cPinnedTab");
      await sleep(140);
      await evaluate("closeOverlay()");
      await sleep(140);
      await click("#reopen");
      await sleep(160);
      state = await readCompact();
      assert.equal(state.view, "recent");
      assert.equal(state.recentActive, true);
    });
  } finally {
    if (ws) ws.close();
    child.kill("SIGKILL");
    await sleep(150);
    rmSync(profile, { recursive: true, force: true });
  }
}

const chrome = findChrome();
if (!chrome || typeof WebSocket === "undefined") {
  console.log(`SKIP browser interaction checks (${chrome ? "WebSocket unavailable" : "Chrome not found"})`);
} else {
  await runDomChecks(chrome);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
