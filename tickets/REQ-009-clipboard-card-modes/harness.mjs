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

check("recent list excludes pinned cards and keeps pinned visible", () => {
  const items = core.sampleItems();
  const recent = core.filterRecentItems(items, "", "all");
  assert.deepEqual(recent.map((item) => item.id), [
    "creed", "placement", "screenshot", "accent", "rocket",
    "rules", "setcmd", "preview", "gtk", "dialog",
  ]);
  assert.deepEqual(core.pinnedOrdered(items).map((item) => item.id), ["note", "repo"]);
  assert.equal(core.filterRecentItems(items, "github", "all").length, 0);
  assert.equal(core.filterRecentItems(items, "gtk4", "all")[0].id, "gtk");
  assert.equal(core.filterRecentItems(items, "", "link").length, 1);
  assert.equal(core.filterRecentItems([], "", "all").length, 0);
});

check("recent selection moves up/down with clamping and no pinned items", () => {
  const recent = core.filterRecentItems(core.sampleItems(), "", "all");
  assert.equal(core.moveRecentSelection(recent, "creed", 1), "placement");
  assert.equal(core.moveRecentSelection(recent, "placement", -1), "creed");
  assert.equal(core.moveRecentSelection(recent, "dialog", 1), "dialog");
  assert.equal(core.moveRecentSelection(recent, "creed", -1), "creed");
  assert.equal(core.moveRecentSelection(recent, null, 1), "creed");
  assert.equal(core.moveRecentSelection([], "creed", 1), null);
});

check("pinned quick-copy only targets pinned cards", () => {
  const items = core.sampleItems();
  assert.equal(core.quickCopyTarget(items, "note"), "note");
  assert.equal(core.quickCopyTarget(items, "repo"), "repo");
  assert.equal(core.quickCopyTarget(items, "creed"), null);
  assert.equal(core.quickCopyTarget([], "note"), null);
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
    "?mode=compact&card=code&pins=1&settings=1&compact_size=large&compact_align=left&empty=1&closed=1",
  );
  assert.deepEqual(deep, {
    mode: "compact",
    card: "code",
    pins: true,
    settings: true,
    compactSize: "large",
    compactAlign: "left",
    empty: true,
    closed: true,
  });
  assert.deepEqual(core.parseDeepLink("?mode=sideways&compact_size=huge&compact_align=diagonal"), {});
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
    'id="cPinned"',
    'id="cPinnedList"',
    'id="cRecentLabel"',
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
    "Click copies",
    "Recent · ",
    "compact_align",
    "← → cards · ↑ pinned · ↓ back",
    "← → select · ↵ copy · ↓ back",
    "Click a card to copy it",
    "Pinned · ",
    "$XDG_CONFIG_HOME/clipboard-ui/config.json",
  ]) {
    assert.ok(html.includes(token), `missing ${token}`);
  }
});

check("compact pinned shelf is a copy-and-collapse shortlist", () => {
  const start = html.indexOf("function quickCopyPinned");
  const end = html.indexOf("\nfunction togglePin", start);
  assert.ok(start > 0 && end > start, "quickCopyPinned must exist");
  const body = html.slice(start, end);
  assert.match(body, /quickCopyTarget\(items, id\)/);
  assert.match(body, /copyItem\(item\)/);
  assert.match(body, /closeOverlay\(\)/);
  assert.doesNotMatch(body, /selectById/);
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
    const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

    const readCompact = () => evaluate(`(() => {
      const panel = document.getElementById("compact");
      const rect = panel.getBoundingClientRect();
      return {
        classes: document.body.className,
        align: document.body.dataset.compactAlign,
        size: document.body.dataset.compactSize,
        pinnedHidden: document.getElementById("cPinned").hidden,
        pinnedTitle: document.getElementById("cPinnedTitle").textContent,
        pinned: [...document.querySelectorAll("#cPinnedList .c-pin-card")].map((card) => card.dataset.id),
        recentHidden: document.getElementById("cRecentLabel").hidden,
        recentLabel: document.getElementById("cRecentLabel").textContent,
        recents: [...document.querySelectorAll("#cList .c-card")].map((card) => card.dataset.id),
        selected: selectedId,
        upHidden: document.getElementById("cUp").hidden,
        downHidden: document.getElementById("cDown").hidden,
        prevHidden: document.getElementById("cPrev").hidden,
        nextHidden: document.getElementById("cNext").hidden,
        status: document.getElementById("cStatus").textContent,
        scrollTop: document.getElementById("cList").scrollTop,
        overflow: panel.scrollHeight > panel.clientHeight + 1,
        pinnedScrollable: document.getElementById("cPinnedList").scrollHeight > document.getElementById("cPinnedList").clientHeight,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    })()`);

    const resetSample = async () => {
      await evaluate(`items = sampleItems(); selectedId = "creed"; query = ""; filter = "all";
        document.getElementById("cSearch").value = ""; setMode("compact"); setCompactAlign("bottom");
        renderAll()`);
      await sleep(120);
    };

    await waitFor(`Boolean(document.getElementById("cPinned")) && Boolean(document.getElementById("cList").children.length)`, "compact boot");

    await checkAsync("bottom compact: pinned shelf above recents, recents exclude pins", async () => {
      await resetSample();
      const state = await readCompact();
      assert.equal(state.align, "bottom");
      assert.equal(state.pinnedHidden, false);
      assert.equal(state.pinnedTitle, "Pinned · 2");
      assert.deepEqual(state.pinned, ["note", "repo"]);
      assert.equal(state.recentHidden, false);
      assert.equal(state.recentLabel, "Recent · 10");
      assert.equal(state.recents.length, 10);
      assert.equal(state.recents.includes("note"), false);
      assert.equal(state.recents.includes("repo"), false);
      assert.equal(state.recents[0], "creed");
      assert.equal(state.upHidden, true);
      assert.equal(state.downHidden, true);
      assert.equal(state.prevHidden, false);
      assert.equal(state.nextHidden, false);
      assert.equal(state.rect.left, 0);
      assert.equal(state.rect.right, state.viewport.width);
      assert.equal(state.rect.bottom, state.viewport.height);
      assert.equal(state.overflow, false);
    });

    await checkAsync("left compact: full-height 12 px inset column, vertical arrows", async () => {
      await evaluate(`setCompactAlign("left")`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.align, "left");
      assert.equal(state.rect.left, 12);
      assert.equal(state.rect.top, 52);
      assert.equal(state.rect.bottom, state.viewport.height - 12);
      assert.equal(state.rect.width, 288);
      assert.equal(state.rect.height, state.viewport.height - 64);
      assert.equal(state.upHidden, false);
      assert.equal(state.downHidden, false);
      assert.equal(state.prevHidden, true);
      assert.equal(state.nextHidden, true);
      assert.deepEqual(state.pinned, ["note", "repo"]);
    });

    await checkAsync("right compact mirrors the column inset", async () => {
      await evaluate(`setCompactAlign("right")`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.align, "right");
      assert.equal(state.rect.right, 1588);
      assert.equal(state.rect.left, 1300);
      assert.equal(state.rect.top, 52);
      assert.equal(state.rect.bottom, state.viewport.height - 12);
      assert.equal(state.rect.width, 288);
    });

    await checkAsync("vertical navigation uses up/down and leaves left/right inert", async () => {
      await evaluate(`setCompactAlign("left"); selectById("creed")`);
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.selected, "creed");
      await press("ArrowDown");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "placement");
      await press("ArrowUp");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "creed");
      await press("ArrowRight");
      await sleep(120);
      state = await readCompact();
      assert.equal(state.selected, "creed");
      await press("ArrowLeft");
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
    });

    await checkAsync("pinned quick-copy copies and collapses, regular cards do not", async () => {
      await click("#cPinnedList .c-pin-card[data-id='repo']");
      await sleep(160);
      let closedState = await evaluate(`({
        closed: document.body.classList.contains("is-closed"),
        reopenHidden: document.getElementById("reopen").hidden,
        toast: document.getElementById("toast").textContent,
      })`);
      assert.equal(closedState.closed, true);
      assert.equal(closedState.reopenHidden, false);
      assert.match(closedState.toast, /Copied link card/);
      await click("#reopen");
      await sleep(160);
      await click("#cList .c-card");
      await press("Enter");
      await sleep(120);
      closedState = await evaluate(`({
        closed: document.body.classList.contains("is-closed"),
        selected: selectedId,
        toast: document.getElementById("toast").textContent,
      })`);
      assert.equal(closedState.closed, false);
      assert.match(closedState.toast, /Copied/);
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
      await evaluate(`query = "gtk4"; filter = "link"; document.getElementById("cSearch").value = query;
        selectById("gtk"); setCompactAlign("left")`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.align, "left");
      assert.equal(state.selected, "gtk");
      assert.equal(state.recents.length, 1);
      assert.equal(state.recents[0], "gtk");
      assert.equal(state.pinned.length, 2);
      const stored = await evaluate(`JSON.parse(localStorage.getItem("clipboard-ui.settings"))`);
      assert.equal(stored.layout.mode, "compact");
      assert.equal(stored.layout.compact.alignment, "left");
      assert.equal(stored.layout.compact.card_size, "medium");
    });

    await checkAsync("no pins hides the compact pinned section and label", async () => {
      await evaluate(`query = ""; filter = "all"; document.getElementById("cSearch").value = "";
        items = sampleItems().map((item) => ({ ...item, pinned: false })); selectedId = items[0].id;
        renderAll()`);
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.pinnedHidden, true);
      assert.equal(state.recentHidden, true);
      assert.equal(state.pinned.length, 0);
      assert.equal(state.recents.length, 12);
    });

    await checkAsync("single pin stays visible and quick-copies", async () => {
      await evaluate(`items = sampleItems(); items.forEach((item) => { item.pinned = item.id === "note"; });
        selectedId = "creed"; query = ""; filter = "all"; renderAll()`);
      await sleep(160);
      let state = await readCompact();
      assert.equal(state.pinnedTitle, "Pinned · 1");
      assert.deepEqual(state.pinned, ["note"]);
      await click("#cPinnedList .c-pin-card[data-id='note']");
      await sleep(160);
      const closed = await evaluate(`document.body.classList.contains("is-closed")`);
      assert.equal(closed, true);
      await click("#reopen");
      await sleep(160);
    });

    await checkAsync("vertical strip and pinned group scroll independently", async () => {
      await evaluate(`items = Array.from({ length: 26 }, (_, index) => ({
          ...sampleItems()[index % 12],
          id: "scroll-" + index,
          pinned: index < 8,
        })); selectedId = "scroll-25"; query = ""; filter = "all";
        setCompactAlign("left"); renderAll(); selectById("scroll-25", { scroll: true })`);
      await sleep(500);
      const state = await readCompact();
      assert.equal(state.pinned.length, 8);
      assert.equal(state.recents.length, 18);
      assert.equal(state.selected, "scroll-25");
      assert.ok(state.scrollTop > 0, `recent list scrollTop was ${state.scrollTop}`);
      assert.equal(state.pinnedScrollable, true);
    });

    await checkAsync("deep link selects right / large", async () => {
      await send("Page.navigate", { url: `${MOCK.href}?mode=compact&compact_align=right&compact_size=large` });
      await waitFor(`document.body.dataset.compactAlign === "right" && !document.getElementById("compact").hidden`, "compact alignment deep link");
      await sleep(160);
      const state = await readCompact();
      assert.equal(state.align, "right");
      assert.equal(state.size, "large");
      assert.equal(state.rect.width, 328);
      assert.equal(state.rect.right, 1588);
      assert.equal(state.pinnedHidden, false);
      assert.equal(state.upHidden, false);
      assert.equal(state.prevHidden, true);
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
