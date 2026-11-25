// ---------------------------------------------------------------------------
// Manifest + handler + template conformance for the ags-clipboard pilot
// (AD-26/AD-27/AD-33/AD-35).
//
// This is the repo-local gate the standalone contract requires:
//   1. `app.manifest.json` is schema-valid and carries the pilot identity;
//   2. app.tsx / window / launcher / history paths agree with that identity;
//   3. the live appearance-refresh handler is real (generation-bound apply,
//      cache clear, search-icon + card rebuild) and non-destructive;
//   4. the shared dev-flow template (AGENTS, tickets, guard, Makefile, CI,
//      tests, templates/ags-app) is present and the platform's own
//      `checkAppRepo` template gate passes;
//   5. no retired app/config/window/launcher name survives.
//
// Run from the repo root:  make conformance
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgsAppManifest } from "ags-platform/ports/app-manifest";
import {
  checkAppRepoAt,
  formatAppConformanceReport,
} from "ags-platform/conformance/app-conformance";
import { contentAccentCss } from "../lib/type-accents.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const IDENTITY = {
  schemaVersion: 1,
  app: "clipboard",
  instance: "clipboard",
  configDir: "ags-clipboard",
  mode: "live",
  holdsUnsavedState: false,
};

function readText(...parts) {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

/** Strip comments, keeping strings intact (same shape as ags-apps' gate). */
function stripComments(source) {
  let out = "";
  let state = null;
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "line") {
      if (c === "\n") {
        state = null;
        out += c;
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        state = null;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "'" || state === '"' || state === "`") {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === state) state = null;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      state = "line";
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      state = "block";
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") state = c;
    out += c;
    i += 1;
  }
  return out;
}

/** The `{...}` body of the function named by `marker`, comments stripped. */
function functionBody(source, marker) {
  const clean = stripComments(source);
  const start = clean.indexOf(marker);
  assert.notEqual(start, -1, `missing function marker: ${marker}`);
  const brace = clean.indexOf("{", start);
  assert.notEqual(brace, -1, `missing function body for: ${marker}`);
  let depth = 0;
  let state = null;
  for (let i = brace; i < clean.length; i += 1) {
    const c = clean[i];
    if (state !== null) {
      if (c === "\\") {
        i += 1;
      } else if (c === state) {
        state = null;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      state = c;
      continue;
    }
    if (c === "{") depth += 1;
    if (c === "}") {
      depth -= 1;
      if (depth === 0) return clean.slice(brace + 1, i);
    }
  }
  throw new Error(`unterminated function body: ${marker}`);
}

function findContractsRoot() {
  const override = process.env.CONTRACTS_ROOT;
  if (override) return override;
  let dir = ROOT;
  for (let i = 0; i < 8; i += 1) {
    dir = dirname(dir);
    if (existsSync(join(dir, "contracts", "schemas", "ags-app-manifest.schema.json"))) {
      return join(dir, "contracts");
    }
  }
  return null;
}

/** Every authored file, minus generated/local-only trees. */
function walk(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      [
        ".git",
        "node_modules",
        "@girs",
        ".dev",
        ".worktrees",
        "build",
        "dist",
        "contracts",
      ].includes(entry.name)
    ) {
      continue;
    }
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(relative(ROOT, absolute).split("\\").join("/"));
  }
  return files;
}

// ── 1. Manifest identity ───────────────────────────────────────────────────

test("the manifest is schema-valid and carries the pilot identity", () => {
  const parsed = parseAgsAppManifest(readText("app.manifest.json"));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues ?? []));
  assert.deepEqual(parsed.manifest, IDENTITY);
});

test("the manifest agrees with app.tsx and the overlay window", () => {
  const app = readText("app.tsx");
  const window = readText("ui", "ClipboardWindow.tsx");
  assert.match(app, /instanceName:\s*"clipboard"/);
  assert.match(window, /export const WINDOW_NAME = "clipboard-window"/);
  assert.match(readText("style.css"), /window#clipboard-window/);
});

test("the app reads the clipboard runtime namespace", () => {
  const history = readText("lib", "history.ts");
  assert.match(history, /\/clipboard\/history\.json/);
  assert.doesNotMatch(history, new RegExp("/" + "hypr" + "[-_]pano" + "/"));
});

test("UI settings are an app-owned clipboard-ui JSON file, never an AGS link", () => {
  const settings = readText("lib", "settings.ts");
  const glib = readText("lib", "settings-glib.ts");
  const store = readText("lib", "settings-store.ts");
  assert.match(settings, /card_size/);
  assert.match(settings, /alignment/);
  assert.match(settings, /"full"/);
  assert.match(settings, /"medium"/);
  assert.match(settings, /"bottom"/);
  assert.match(glib, /clipboard-ui\/config\.json/);
  assert.match(glib, /XDG_CONFIG_HOME/);
  assert.doesNotMatch(glib, /ags\/config|config\.symlink|ags-clipboard/);
  assert.match(store, /loadSettings/);
  assert.match(store, /saveSettings/);
});

test("the settings document is saved on every change", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const persist = functionBody(window, "function persist(): void");
  assert.match(persist, /saveSettings\(/);
  for (const setter of [
    "function setMode(next: LayoutMode): void",
    "function setCompactSize(next: CompactSize): void",
    "function setCompactAlign(next: CompactAlignment): void",
  ]) {
    assert.match(functionBody(window, setter), /persist\(\)/, `${setter} must persist`);
  }
});

test("compact link cards expose a visible Open chip that uses the link path", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  assert.match(itemCard, /clipboard-open-chip/);
  assert.match(itemCard, /open\.connect\("clicked", \(\) => onOpenLink\(item\)\)/);
  assert.doesNotMatch(itemCard, /hover.*open/i, "the Open chip is not hover-only");
});

test("compact view switching and pinned-grid focus stay wired", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const key = functionBody(window, "function onKey");
  assert.match(key, /keyval === Gdk\.KEY_Tab/);
  assert.match(key, /toggleCompactView\(\)/);
  assert.match(key, /keyval === Gdk\.KEY_Left/);
  assert.match(key, /movePins\(-1\)/);
  assert.match(key, /copyFocusedPin\(\)/);
  assert.match(key, /keyval === Gdk\.KEY_Up[\s\S]*openPins\(\)/);
  assert.match(window, /initialPinFocus\(/);
  assert.match(window, /pinCopyTarget\(/);
});

test("the launcher and keybind description are documented for consumers", () => {
  const readme = readText("README.md");
  assert.match(readme, /`clipboard-ui`/);
  assert.match(readme, /Open clipboard history/);
  assert.match(readme, /ags-clipboard/);
});

test("no retired app/config/window/launcher name survives", () => {
  // Split so this gate's own source cannot match the pattern it enforces.
  const forbidden = new RegExp("hypr" + "[-_]pano|ags-" + "hypr", "i");
  const offenders = walk().filter((file) => forbidden.test(readText(file)));
  assert.deepEqual(offenders, [], `retired name found in: ${offenders.join(", ")}`);
});

// ── 2. Repository template + platform conformance ──────────────────────────

test("the platform template gate passes for this repo", () => {
  const report = checkAppRepoAt(ROOT);
  assert.equal(report.ok, true, formatAppConformanceReport(report, ROOT));
});

test("the frozen copyable template is present for the next app", () => {
  const template = join(ROOT, "templates", "ags-app");
  const required = [
    "AGENTS.md",
    "README.md",
    "Makefile",
    "app.tsx",
    "app.manifest.json",
    "tsconfig.app.json",
    "scripts/worktree-guard.sh",
    "tickets/LIFECYCLE.md",
    "tickets/INDEX.md",
    "tickets/_template/requirement.md",
    "tests/app-contract.test.mjs",
    "tests/unit.test.mjs",
    ".github/workflows/ci.yml",
  ];
  for (const path of required) {
    assert.ok(existsSync(join(template, path)), `templates/ags-app/${path} is missing`);
  }
  for (const token of ["{{APP}}", "{{INSTANCE}}", "{{CONFIG_DIR}}", "{{REPO}}"]) {
    assert.match(
      readText("templates", "ags-app", "template.json"),
      new RegExp(token.replace(/[{}]/g, "\\$&")),
      `template.json must declare ${token}`,
    );
  }
});

test("the contracts v0.12.0 manifest schema agrees with the platform", () => {
  const contractsRoot = findContractsRoot();
  assert.notEqual(contractsRoot, null, "cannot find contracts (set CONTRACTS_ROOT)");
  const schema = JSON.parse(
    readFileSync(join(contractsRoot, "schemas", "ags-app-manifest.schema.json"), "utf8"),
  );
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    [...schema.required].sort(),
    ["app", "configDir", "holdsUnsavedState", "instance", "mode", "schemaVersion"],
  );
  assert.equal(
    schema.allOf[0].then.properties.holdsUnsavedState.const,
    false,
    "restart stays invalid when holdsUnsavedState is true",
  );
});

test("the Makefile pins the v1.1.0 platform / v0.12.0 contracts tuple", () => {
  const makefile = readText("Makefile");
  assert.match(makefile, /^AGS_PLATFORM_VERSION := v1\.1\.0$/m);
  assert.match(makefile, /^CONTRACTS_VERSION := v0\.12\.0$/m);
});

// ── 3. The live handler is real and non-destructive ────────────────────────

test("app.tsx registers the real appearance-refresh handler", () => {
  const app = readText("app.tsx");
  assert.match(app, /from\s+"ags-platform\/adapters\/appearance"/);
  assert.match(
    app,
    /const appearance = createAppearance\(\{\s*configDir: "ags-clipboard",?\s*\}\)/,
  );
  assert.match(app, /appearance\.apply\(\)/, "the whole appearance is applied");
  assert.match(
    app,
    /createAppearanceRefreshHandler\(appearance,/,
    "the platform helper re-applies the appearance before app work",
  );
  assert.match(app, /requestHandler\s*\(/);
  assert.match(app, /APPEARANCE_REFRESH_COMMAND/, "the v3 command is imported");
  assert.match(
    app,
    /if \(argv\[0\] === APPEARANCE_REFRESH_COMMAND\)[\s\S]*appearanceRefresh\(argv, res\)/,
    "appearance-refresh dispatches before the show/hide/toggle surface",
  );
  assert.doesNotMatch(app, /PALETTE_REFRESH_COMMAND|ports\/palette-refresh/);
  assert.doesNotMatch(app, /\{"ok":true\}|\{ ok: true \}/, "v3 acks are generation-bound");
  assert.doesNotMatch(app, /theme\.apply\(\)|\bskin\.apply\(\)/);
  assert.match(app, /refreshClipboardAppearance\(\)/, "the widgets are rebuilt");
  assert.match(
    app,
    /refreshClipboardAppearance\(\)[\s\S]*return \{ status: "applied" \}/,
    "v1.1.0 rejects a void work result, so the work reports applied",
  );
});

test("the refresh clears the rasterized-icon texture cache", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  const body = functionBody(itemCard, "export function clearVisualCaches");
  assert.match(body, /textureCache\.clear\(\)/);
  assert.doesNotMatch(body, /tokenCache/);
});

test("the refresh surface rebuilds the search icon and cards", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const searchIcon = functionBody(window, "function rebuildSearchIcon");
  assert.match(searchIcon, /uiIcon\("search"/);
  assert.match(searchIcon, /searchBox\.remove\(searchIcon\)/);
  assert.match(searchIcon, /searchBox\.prepend\(next\)/);
  assert.doesNotMatch(searchIcon, /search\.set_text/, "the query entry is untouched");

  assert.match(
    window,
    /appearanceSurfaces\.push\(\{\s*clearCaches: clearVisualCaches,\s*rebuildSearchIcon,\s*rebuildCards: renderAll,/s,
  );
  const refresh = functionBody(window, "export function refreshClipboardAppearance");
  assert.match(refresh, /applyAppearance\(surface\)/);
});

test("the card rebuild preserves overlay visibility, query, selection and list", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  for (const marker of [
    "function renderAll(): void",
    "function renderFull(): void",
    "function renderCompact(): void",
  ]) {
    const body = functionBody(window, marker);
    assert.doesNotMatch(body, /readHistory\(/, `${marker} must not re-read history`);
    assert.doesNotMatch(body, /query\s*=/, `${marker} must not reset the query`);
    assert.doesNotMatch(body, /items\s*=\s*\[/, `${marker} must not replace the list`);
    assert.doesNotMatch(body, /paused\s*=/, `${marker} must not reset incognito`);
    assert.doesNotMatch(body, /jobId\s*=/, `${marker} must not reset the daemon job`);
    assert.doesNotMatch(body, /search\.set_text/, `${marker} must not rewrite search`);
    assert.doesNotMatch(body, /\b(hideWindow|showWindow|toggleWindow)\(/, `${marker} must not move visibility`);
    assert.doesNotMatch(body, /\.visible\s*=/, `${marker} must not change visibility`);
    assert.doesNotMatch(body, /mapped\s*=/, `${marker} must not change mapped state`);
  }
  // Selection is retained by stable card identity, not reset to the head.
  assert.match(
    functionBody(window, "function ensureSelection(): void"),
    /selectedKey = itemKey\(list\[0\]\)/,
  );
});

// ── REQ-009 owner feedback round 1 ─────────────────────────────────────────

test("settings is an in-page panel with a full-window catcher", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const css = readText("style.css");
  assert.match(window, /function buildSettingsPanel\(\): Gtk\.Box/);
  assert.match(window, /settingsCatcher\.add_css_class\("clipboard-settings-catcher"\)/);
  assert.match(window, /settingsCatcherClick\.connect\("pressed", \(\) => closeSettings\(\)\)/);
  assert.match(window, /root\.add_overlay\(settingsCatcher\)/);
  assert.match(window, /root\.add_overlay\(settingsPanelWidget\)/);
  assert.doesNotMatch(window, /Gtk\.Popover|Gtk\.MenuButton|set_popover|clipboard-settings-popover/);
  assert.match(window, /label\("Settings", "clipboard-settings-title"\)/);
  assert.match(window, /Full stage or compact strip\./);
  assert.match(window, /220 \/ 260 \/ 300 px\./);
  assert.match(window, /Bottom strip, or a full-height side column\./);
  assert.doesNotMatch(window, /clipboard-settings-path/);
  assert.doesNotMatch(window, /Saved on change\. Not the daemon config\./);
  assert.doesNotMatch(css, /\.clipboard-settings-path|\.clipboard-settings-note|\.clipboard-settings-foot/);

  assert.match(css, /\.clipboard-settings-catcher\s*\{[^}]*background-color:\s*transparent/s);
  assert.match(css, /\.clipboard-settings\s*\{[^}]*border-radius:\s*15px/s);
  assert.match(css, /\.clipboard-settings\s*\{[^}]*padding:\s*14px/s);
  assert.match(css, /\.clipboard-settings\s*\{[^}]*border:\s*1px solid/s);
  assert.doesNotMatch(css, /\.clipboard-settings\s*\{[^}]*min-width:\s*250px/s);
});

test("in-page settings opens modally and closes on Esc or outside click", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  assert.match(functionBody(window, "function openSettings"), /settingsPanelOpen = true/);
  assert.match(functionBody(window, "function openSettings"), /settingsCatcher\.set_visible\(true\)/);
  assert.match(functionBody(window, "function openSettings"), /settingsPanelWidget\?\.set_visible\(true\)/);
  assert.match(functionBody(window, "function closeSettings"), /settingsPanelOpen = false/);
  assert.match(functionBody(window, "function closeSettings"), /settingsCatcher\.set_visible\(false\)/);
  assert.match(functionBody(window, "function closeSettings"), /settingsPanelWidget\?\.set_visible\(false\)/);
  assert.match(functionBody(window, "function toggleSettings"), /settingsPanelOpen/);
  assert.doesNotMatch(
    functionBody(window, "function applyWindowLayout"),
    /settingsPanelOpen|compactAlign|mode ===/,
    "the window anchor is stable; settings never re-anchor it",
  );
  const mode = functionBody(window, "function applyMode");
  assert.match(mode, /settingsCatcher\.set_visible\(settingsPanelOpen\)/);
  assert.match(mode, /settingsPanelWidget\?\.set_visible\(settingsPanelOpen\)/);
  const key = functionBody(window, "function onKey");
  assert.match(key, /if \(settingsOpen\(\)\)[\s\S]*?closeSettings\(\)/);
});

test("compact cards use the exact size token and vertical columns resize", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const css = readText("style.css");
  assert.doesNotMatch(css, /\.clipboard-card\s*\{[^}]*min-width:\s*260px/s);
  assert.match(
    window,
    /compactRoot\.set_size_request\(vertical \? compactWidth\(\) : -1, -1\)/,
  );
  assert.match(window, /searchBox\.set_size_request\(vertical \? compactWidth\(\) : -1, -1\)/);
  assert.match(window, /if \(!vertical\) \{[\s\S]*?spacer\.set_hexpand\(true\)/);
  assert.match(window, /return compactSize === "medium" \? cardWidth : compactCardWidth\(compactSize\)/);
});

test("nav and strip arrows have fixed circular sizes", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const css = readText("style.css");
  assert.match(window, /arrow\.set_size_request\(46, 46\)/);
  assert.match(window, /arrow\.set_size_request\(32, 32\)/);
  assert.match(window, /arrow\.set_valign\(Gtk\.Align\.CENTER\)/);
  assert.match(window, /arrow\.set_vexpand\(false\)/);
  // GTK 4 has no max-width/max-height; the widget size request is the cap.
  assert.doesNotMatch(css, /\.clipboard-nav-arrow\s*\{[^}]*max-width/s);
  assert.doesNotMatch(css, /\.clipboard-strip-arrow\s*\{[^}]*max-height/s);
  assert.match(css, /\.clipboard-nav-arrow\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.clipboard-strip-arrow\s*\{[^}]*border-radius:\s*999px/s);
});

test("every card kind wires the pin control and guards its click", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const itemCard = readText("ui", "ItemCard.tsx");
  for (const marker of [
    "export function ItemCard",
    "export function StageCard",
    "export function PeekCard",
    "export function PinCard",
  ]) {
    assert.match(
      functionBody(itemCard, marker),
      /onTogglePin/,
      `${marker} must accept the pin callback`,
    );
    assert.match(
      functionBody(itemCard, marker),
      /ItemHead\([^)]*onTogglePin/s,
      `${marker} must pass the pin callback to ItemHead`,
    );
  }
  assert.match(itemCard, /guardChildClick\(pinButton, options\.suppress\)/);
  assert.match(itemCard, /const claimed = \(\) => suppress !== undefined && Date\.now\(\) < suppress\.until/);
  assert.match(window, /StageCard\(item, copyAndCollapse, openLink, width, height, togglePin\)/);
  assert.match(window, /PeekCard\([\s\S]*?togglePin\)/);
  assert.match(window, /PinCard\([\s\S]*?togglePin,\s*\)/);
  assert.match(window, /ItemCard\([\s\S]*?togglePin,\s*\)/);
});

test("compact actions and filter chips carry semantic icons and dots", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const itemCard = readText("ui", "ItemCard.tsx");
  const css = readText("style.css");
  assert.match(window, /iconTextButton\("Incognito: off", "clipboard-incognito", "pause"\)/);
  assert.match(window, /iconTextButton\("Clear", "clipboard-clear", "trash"\)/);
  assert.match(window, /incognito\.setIcon\(paused \? "play" : "pause"\)/);
  assert.match(window, /clear\.setIcon\("trash"\)/);
  for (const token of ["media-playback-pause-symbolic", "media-playback-start-symbolic", "user-trash-symbolic"]) {
    assert.match(itemCard, new RegExp(token), `missing fallback ${token}`);
  }
  assert.match(window, /dot\.add_css_class\("clipboard-filter-dot"\)/);
  assert.match(window, /dot\.add_css_class\(`kind-\$\{value\}`\)/);
  for (const kind of ["text", "code", "color", "image", "link", "emoji"]) {
    assert.match(css, new RegExp(`\\.clipboard-filter-dot\\.kind-${kind}\\s*\\{`), `missing dot role for ${kind}`);
  }
});

test("the full bar has icon + keycap controls and Ctrl+Enter opens links", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  assert.match(window, /barButton\("Copy", "copy", "\\u21b5", "primary"\)/);
  assert.match(window, /barButton\("Pin", "pin", "Ctrl\+F"\)/);
  assert.match(window, /barButton\("Delete", "trash", "Del", "danger"\)/);
  assert.match(window, /barButton\("Open", "external", null\)/);
  assert.match(window, /pinBar\.label\.set_label\(item\.favorite \? "Unpin" : "Pin"\)/);
  const key = functionBody(window, "function onKey");
  assert.match(
    key,
    /control && \(keyval === Gdk\.KEY_Return \|\| keyval === Gdk\.KEY_KP_Enter\)[\s\S]*?item\.kind === "link"\) openLink\(item\)/,
  );
  assert.match(key, /keyval === Gdk\.KEY_Delete/);
});

test("the pinned view is an overlay over the stage with the mock geometry", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const itemCard = readText("ui", "ItemCard.tsx");
  const css = readText("style.css");
  assert.match(window, /const root = new Gtk\.Overlay\(\)/);
  assert.match(window, /root\.set_child\(stageBase\)/);
  assert.match(window, /root\.add_overlay\(pinsPanel\)/);
  assert.match(window, /fullRoot\.set_visible\(full\)/);
  assert.match(css, /\.clipboard-pins-panel\s*\{[^}]*padding:\s*104px 24px 20px/s);
  assert.match(css, /\.clipboard-pins-panel\s*\{[^}]*background-color:\s*alpha\(@scrim/s);
  assert.match(window, /column_homogeneous: true/);
  assert.match(window, /pinsGrid\.set_halign\(Gtk\.Align\.FILL\)/);
  assert.match(
    window,
    /pinsHead\.append\(pinsTitle\)[\s\S]*?pinsHead\.append\(pinsBack\)[\s\S]*?pinsHead\.append\(pinsHints\)[\s\S]*?pinsHead\.append\(pinsHint\)/,
    "header order must be title, back, hints, spacer, hint",
  );
  assert.match(itemCard, /set_size_request\(-1, 236\)/);
  assert.match(itemCard, /button\.set_vexpand\(false\)/);
  assert.match(itemCard, /card\.set_vexpand\(true\)/);
  assert.match(itemCard, /body\.set_vexpand\(true\)/);
  assert.match(window, /clipboard-pin-filler/);
  assert.match(window, /pinsGrid\.set_valign\(Gtk\.Align\.START\)/);
  assert.match(css, /\.clipboard-pin-card\s*\{[^}]*border-radius:\s*17px/s);
  assert.match(css, /\.kind-text\.clipboard-pin-card\.focused\s*\{[^}]*0 0 0 7px/s);
  assert.match(window, /pinsBackBar = barButton\("Back", "down", "Esc"\)/);
});

// ── REQ-009 owner feedback round 2 ─────────────────────────────────────────

test("the app stylesheet avoids GTK-unsupported CSS properties", () => {
  const css = readText("style.css")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  // GTK 4 does not implement these web/CSS-box properties; an unknown
  // property is a load-time CSS error and can stall the overlay.
  const unsupported = [
    "max-width",
    "max-height",
    "min-inline-size",
    "max-inline-size",
    "gap",
    "row-gap",
    "column-gap",
    "inset",
    "z-index",
    "display",
    "position",
    "overflow",
    "overflow-x",
    "overflow-y",
    "backdrop-filter",
    "transition",
    "transform",
    "animation",
    "box-sizing",
    "aspect-ratio",
    "cursor",
  ];
  for (const property of unsupported) {
    assert.doesNotMatch(
      css,
      new RegExp(`(^|\\n)\\s*${property}\\s*:`),
      `style.css uses unsupported GTK property ${property}`,
    );
  }
});

const TYPE_ROLES = {
  text: ["primary", "on_primary"],
  link: ["primary_container", "on_primary_container"],
  code: ["secondary_container", "on_secondary_container"],
  image: ["secondary", "on_secondary"],
  color: ["tertiary", "on_tertiary"],
  emoji: ["tertiary_container", "on_tertiary_container"],
};

test("fallback chrome has no hard-coded hex and keeps per-kind rings", () => {
  const css = readText("style.css")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "style.css must not hard-code chrome hex colors");

  for (const [kind, [fill]] of Object.entries(TYPE_ROLES)) {
    const selected = functionBodyCss(css, `.kind-${kind}.selected`);
    assert.match(selected, /border-color:\s*transparent/);
    assert.match(selected, new RegExp(`box-shadow:[^;]*alpha\\(@${fill}\\b`));
    const focused = functionBodyCss(css, `.kind-${kind}.clipboard-pin-card.focused`);
    assert.match(focused, /border-color:\s*transparent/);
    assert.match(focused, new RegExp(`box-shadow:[^;]*@${fill}\\b`));
    assert.match(focused, /0 0 0 7px/);
  }
  assert.doesNotMatch(css, /\.clipboard-card\.selected\s*\{/, "selection is per-kind");
  assert.match(css, /\.clipboard-chip\.selected\s*\{[^}]*alpha\(@primary/s);
});

test("card headers use the six accent families and matching on_* ink", () => {
  const css = readText("style.css");
  for (const [kind, [fill, ink]] of Object.entries(TYPE_ROLES)) {
    const head = functionBodyCss(css, `.kind-${kind} .clipboard-head`);
    assert.match(head, new RegExp(`background-color:\\s*@${fill}\\b`));
    assert.match(head, new RegExp(`color:\\s*@${ink}\\b`));
    const filter = functionBodyCss(css, `.clipboard-filter-dot.kind-${kind}`);
    assert.match(filter, new RegExp(`background-color:\\s*@${fill}\\b`));
    const dot = functionBodyCss(css, `.clipboard-type-dot.kind-${kind}`);
    assert.match(dot, new RegExp(`background-color:\\s*@${ink}\\b`));
  }
  const structural = functionBodyCss(css, ".clipboard-head");
  assert.doesNotMatch(structural, /background-color:|color:/);
  assert.match(readText("ui", "ItemCard.tsx"), /clipboard-type-dot/);
});

test("type accents use one app-owned display provider at USER + 1", () => {
  const accents = readText("lib", "type-accents.ts");
  const paint = readText("ui", "content-accent.ts");
  const window = readText("ui", "ClipboardWindow.tsx");
  const accentCss = contentAccentCss();
  for (const [kind, [fill, ink]] of Object.entries(TYPE_ROLES)) {
    assert.match(accents, new RegExp(`${kind}:\\s*\\{\\s*fill:\\s*"${fill}",\\s*ink:\\s*"${ink}"\\s*\\}`));
    assert.match(accentCss, new RegExp(`\\.kind-${kind} \\.clipboard-head[\\s\\S]*?@${fill}[\\s\\S]*?@${ink}`));
    assert.match(accentCss, new RegExp(`\\.clipboard-type-dot\\.kind-${kind}`));
    assert.match(accentCss, new RegExp(`\\.clipboard-filter-dot\\.kind-${kind}`));
    assert.match(accentCss, new RegExp(`\\.kind-${kind} \\.clipboard-pin-button`));
    assert.match(accentCss, new RegExp(`\\.kind-${kind}\\.selected`));
    assert.match(accentCss, new RegExp(`\\.kind-${kind}\\.clipboard-pin-card\\.focused`));
  }
  assert.match(paint, /Gtk\.StyleContext\.add_provider_for_display/);
  assert.match(paint, /Gtk\.STYLE_PROVIDER_PRIORITY_USER \+ 1/);
  assert.doesNotMatch(paint, /get_style_context\(\)\.add_provider/);
  assert.match(window, /installContentAccents\(\)/);
  assert.doesNotMatch(window, /paintTypeHeader|paintTypeDot|paintFilterDot|paintPinButton|paintSelectedCard|paintFocusedPinCard/);
  assert.match(accentCss, /\.kind-.*\.selected[\s\S]*?border-color:\s*transparent/);
  assert.match(accentCss, /\.kind-.*\.clipboard-pin-card\.focused[\s\S]*?border-color:\s*transparent/);
});

test("the layer-shell window stays full-monitor and input region follows the compact shell", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const layout = functionBody(window, "function applyWindowLayout");
  assert.match(layout, /Astal\.WindowAnchor\.TOP/);
  assert.match(layout, /Astal\.WindowAnchor\.BOTTOM/);
  assert.match(layout, /Astal\.WindowAnchor\.LEFT/);
  assert.match(layout, /Astal\.WindowAnchor\.RIGHT/);
  assert.doesNotMatch(layout, /compactAlign|settingsPanelOpen|mode ===/);
  assert.match(layout, /overlay\.margin_top = 0/);
  assert.match(layout, /overlay\.margin_bottom = 0/);
  assert.doesNotMatch(window, /initialMargins/);

  const region = functionBody(window, "function applyInputRegion");
  assert.match(region, /overlay\?\.get_surface\(\)/);
  assert.match(region, /surface\.set_input_region\(null\)/);
  assert.match(region, /mode === "full" \|\| settingsPanelOpen/);
  assert.match(region, /compactRoot\.get_allocation\(\)/);
  assert.match(region, /new cairo\.Region\(\)/);
  assert.match(region, /unionRectangle/);
  assert.match(region, /surface\.set_input_region\(/);
  const schedule = functionBody(window, "function scheduleInputRegion");
  assert.match(schedule, /GLib\.idle_add/);
  assert.match(window, /scheduleInputRegion\(\)/);

  // Opening/closing settings only toggles visibility + reapplies the shell.
  for (const marker of ["function openSettings", "function closeSettings"]) {
    const body = functionBody(window, marker);
    assert.doesNotMatch(body, /overlay\.anchor|margin_top|margin_bottom/);
    assert.match(body, /applyMode\(\)/);
  }

  const shell = functionBody(window, "function applyCompactShell");
  assert.match(shell, /compactRoot\.set_margin_start\(12\)/);
  assert.match(shell, /compactRoot\.set_margin_end\(12\)/);
  assert.match(shell, /compactRoot\.set_margin_bottom\(12\)/);
  assert.match(shell, /compactRoot\.set_margin_top\(52\)/);
});

test("compact selection is incremental and shell resets on alignment", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const select = functionBody(window, "function selectCompactKey");
  assert.match(select, /compactCards\.get\(key\)/);
  assert.match(select, /previous\?\.remove_css_class\("selected"\)/);
  assert.match(select, /next\.add_css_class\("selected"\)/);
  assert.doesNotMatch(select, /renderCompact\(\)/);
  const move = functionBody(window, "function selectByKey");
  assert.match(move, /if \(selectCompactKey\(key, scroll\)\) return/);
  const copy = functionBody(window, "function copyOnly");
  assert.doesNotMatch(copy, /renderCompact\(\)|renderFull\(\)/);

  const shell = functionBody(window, "function applyCompactShell");
  assert.match(shell, /compactSpacer\.set_visible\(activeCompact && !vertical\)/);
  assert.match(shell, /compactRoot\.set_vexpand\(true\)/);
  assert.match(shell, /compactRoot\.set_valign\(Gtk\.Align\.FILL\)/);
  assert.match(shell, /compactRoot\.set_halign\([\s\S]*?Gtk\.Align\.START/);
  assert.match(shell, /compactRoot\.set_vexpand\(false\)/);
  assert.match(shell, /compactRoot\.set_valign\(Gtk\.Align\.END\)/);
  assert.match(shell, /compactRoot\.set_size_request\(vertical \? compactWidth\(\) : -1, -1\)/);
  for (const marker of [
    "function applyMode",
    "function renderCompact",
  ]) {
    assert.match(functionBody(window, marker), /applyCompactShell\(\)/, `${marker} must reapply the shell`);
  }
  assert.match(functionBody(window, "function setCompactAlign"), /applyMode\(\)/);
});

test("stage cards are fixed-size and link/code labels are width-capped", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  const preview = readText("ui", "Preview.tsx");
  const stage = functionBody(itemCard, "export function StageCard");
  assert.match(stage, /new Gtk\.ScrolledWindow/);
  assert.match(stage, /frame\.set_propagate_natural_width\(false\)/);
  assert.match(stage, /frame\.set_propagate_natural_height\(false\)/);
  assert.match(stage, /frame\.set_size_request\(width, height\)/);
  assert.match(stage, /card\.set_size_request\(width, height\)/);
  assert.match(preview, /const linkChars = Math\.max\(12, Math\.floor\(width \/ 8\)\)/);
  assert.match(preview, /url\.set_width_chars\(linkChars\)/);
  assert.match(preview, /url\.set_max_width_chars\(linkChars\)/);
  assert.match(preview, /url\.set_ellipsize\(Pango\.EllipsizeMode\.END\)/);
  assert.match(preview, /url\.set_lines\(2\)/);
  assert.match(preview, /label\.set_ellipsize\(stage \? Pango\.EllipsizeMode\.NONE/);
  assert.match(preview, /stage && \(item\.kind === "text" \|\| item\.kind === "code"\)/);
  assert.match(preview, /set_lines\(item\.kind === "code" \? \(stage \? 10 : 6\)/);
});

test("pin button centers a single child", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  assert.match(itemCard, /new Gtk\.CenterBox\(\)/);
  assert.match(itemCard, /pinCenter\.set_center_widget\(pinIcon\)/);
  assert.match(itemCard, /pinIcon\.set_halign\(Gtk\.Align\.CENTER\)/);
  assert.match(itemCard, /pinIcon\.set_valign\(Gtk\.Align\.CENTER\)/);
  assert.match(itemCard, /pinButton\.set_size_request\(22, 22\)/);
  assert.match(itemCard, /pinButton\.set_valign\(Gtk\.Align\.CENTER\)/);
});

test("full layout has synced search/filter and inline clear", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  assert.match(window, /const fullSearch = new Gtk\.Entry/);
  assert.match(window, /const fullFilters = new Gtk\.FlowBox/);
  assert.match(window, /fullSearch\.connect\("changed", \(\) => setSearchQuery\(fullSearch\.get_text\(\), fullSearch\)\)/);
  assert.match(window, /for \(const entry of \[search, fullSearch\]\)/);
  assert.match(window, /function applyFilter\(value: TypeFilter\)/);
  assert.match(window, /function syncFilterChips\(\)/);
  assert.match(window, /function fullList\(\): ClipboardItem\[\]/);
  assert.match(window, /return filterItems\(items, query, filter\)/);
  assert.match(window, /const entry = mode === "full" \? fullSearch : search/);

  assert.match(window, /fullClearBar = barButton\("Clear", "trash", null, "danger"\)/);
  assert.match(window, /fullClearButton\.connect\("clicked", askClear\)/);
  assert.match(window, /fullClearConfirmBox/);
  assert.match(window, /function performClear\(\): void/);
  assert.match(window, /clearConfirm = true/);
  assert.match(window, /fullClearButton\.set_visible\(!clearConfirm\)/);
});

test("image previews contain the whole capture instead of cropping it", () => {
  const preview = readText("ui", "Preview.tsx");
  const itemCard = readText("ui", "ItemCard.tsx");
  assert.match(preview, /Gtk\.ContentFit\.CONTAIN/);
  assert.doesNotMatch(preview, /Gtk\.ContentFit\.COVER/);
  assert.match(preview, /picture\.set_halign\(Gtk\.Align\.CENTER\)/);
  assert.match(preview, /picture\.set_valign\(Gtk\.Align\.CENTER\)/);
  assert.match(itemCard, /const image = item\.kind === "image"/);
  assert.match(itemCard, /height: Math\.max\(160, image \? height - 38 : height - 76\)/);
});

test("pinned panel fills the full stage and search boxes show the slash keycap", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const mode = functionBody(window, "function applyMode");
  assert.match(mode, /pinsPanel\.set_halign\(Gtk\.Align\.FILL\)/);
  assert.match(mode, /pinsPanel\.set_valign\(Gtk\.Align\.FILL\)/);
  assert.match(mode, /pinsGrid\.set_halign\(Gtk\.Align\.FILL\)/);
  assert.equal((window.match(/keycap\("\/"\)/g) ?? []).length, 2);
});

test("layout and orientation changes close the in-page settings panel", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  for (const setter of [
    "function setMode(next: LayoutMode): void",
    "function setCompactAlign(next: CompactAlignment): void",
  ]) {
    const body = functionBody(window, setter);
    assert.match(
      body,
      /applyMode\(\)[\s\S]*?renderAll\(\)[\s\S]*?refreshSettings\(\)[\s\S]*?if \(settingsPanelOpen\) closeSettings\(\)/,
      `${setter} must close settings after applying the new layout`,
    );
  }
  const size = functionBody(window, "function setCompactSize(next: CompactSize): void");
  assert.doesNotMatch(size, /closeSettings\(\)/, "card-size changes keep the panel open");
});

test("Enter copies and collapses in full and compact", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const key = functionBody(window, "function onKey");
  // Typing branch: Enter also collapses in compact.
  assert.match(
    key,
    /if \(typing\)[\s\S]*?if \(keyval === Gdk\.KEY_Return \|\| keyval === Gdk\.KEY_KP_Enter\) \{[\s\S]*?copyAndCollapse\(item\)/,
  );
  // Final Enter branch: same for both modes.
  assert.match(
    key,
    /if \(keyval === Gdk\.KEY_Return \|\| keyval === Gdk\.KEY_KP_Enter\) \{\s*const item = selectedItem\(\)\s*if \(item !== null\) copyAndCollapse\(item\)\s*return true/s,
  );
  // Ctrl+1..9 remains copy-only in compact.
  assert.equal((key.match(/else copyOnly\(item\)/g) ?? []).length, 1);
  assert.match(window, /copy\+close/);
});

test("gear and pin controls are square and skin-derived", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const itemCard = readText("ui", "ItemCard.tsx");
  const css = readText("style.css");
  assert.equal((window.match(/set_size_request\(38, 38\)/g) ?? []).length, 2);
  assert.match(itemCard, /pinButton\.set_size_request\(22, 22\)/);
  assert.match(itemCard, /pinButton\.set_valign\(Gtk\.Align\.CENTER\)/);

  // Plain gear button (no MenuButton/popover child node).
  assert.match(window, /new Gtk\.Button\(\{ css_classes: \["clipboard-gear"\] \}\)/);
  assert.doesNotMatch(window, /Gtk\.MenuButton/);
  assert.match(css, /\.clipboard-gear\s*\{[^}]*background-color:\s*transparent/s);
  assert.match(css, /\.clipboard-gear\s*\{[^}]*border:\s*none/s);
  assert.match(css, /\.clipboard-gear\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /\.clipboard-gear:hover\s*\{[^}]*box-shadow:\s*0 0 0 1px alpha\(@primary/s);
  assert.doesNotMatch(css, /menubutton\.clipboard-gear/);

  // The pin is a visible square; coloured headers tint it with on_* ink.
  assert.match(css, /\.clipboard-pin-button\s*\{[^}]*min-width:\s*22px/s);
  assert.match(css, /\.clipboard-pin-button\s*\{[^}]*min-height:\s*22px/s);
  assert.match(css, /\.clipboard-pin-button\s*\{[^}]*background-color:\s*alpha\(@on_surface, 0\.18\)/s);
  assert.match(css, /\.clipboard-pin-button\s*\{[^}]*border:\s*1px solid alpha\(@on_surface/s);
  assert.match(css, /\.clipboard-pin-button:hover\s*\{[^}]*alpha\(@on_surface, 0\.30\)/s);
  assert.match(css, /\.clipboard-pin-button\.is-on\s*\{[^}]*alpha\(@on_surface, 0\.42\)/s);
  for (const [kind, [, ink]] of Object.entries(TYPE_ROLES)) {
    const fill = functionBodyCss(css, `.kind-${kind} .clipboard-pin-button`);
    assert.match(fill, new RegExp(`background-color:\\s*alpha\\(@${ink}\\b`), `${kind} pin must use @${ink}`);
  }
});

test("compact opens without focusing search and arrows stay reachable", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const map = functionBody(window, 'self.connect("map"');
  assert.doesNotMatch(map, /search\.grab_focus/, "compact must not autofocus search on open");
  assert.match(window, /root\.set_can_focus\(true\)/);
  assert.match(map, /root\.grab_focus\(\)/);
  const key = functionBody(window, "function onKey");
  assert.match(key, /keyval === Gdk\.KEY_slash[\s\S]*?const entry = mode === "full" \? fullSearch : search[\s\S]*?entry\.grab_focus\(\)/);
  assert.match(key, /const typing = mode === "full" \? fullSearch\.has_focus : search\.has_focus/);
  assert.match(key, /moveCompactSelection\(list, selectedKey, -1\)/);
  assert.match(key, /moveCompactSelection\(list, selectedKey, 1\)/);
  assert.match(key, /toggleCompactView\(\)/);
  assert.match(key, /control && \(keyval === Gdk\.KEY_Return \|\| keyval === Gdk\.KEY_KP_Enter\)/);
});

test("search focus ring lives on the rounded box, not the inner entry", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const css = readText("style.css");
  const bind = functionBody(window, "function bindSearchFocus");
  assert.match(bind, /if \(entry\.has_focus\) box\.add_css_class\("focused"\)/);
  assert.match(bind, /else box\.remove_css_class\("focused"\)/);
  assert.match(window, /bindSearchFocus\(search, searchBox\)/);
  assert.match(window, /bindSearchFocus\(fullSearch, fullSearchBox\)/);
  assert.match(css, /\.clipboard-search-box\.focused\s*\{[^}]*border-color:\s*@primary/s);
  assert.match(css, /\.clipboard-search-box\.focused\s*\{[^}]*box-shadow:\s*0 0 0 1px alpha\(@primary/s);
  assert.match(css, /\.clipboard-search:focus,[\s\S]*?outline:\s*none/);
  assert.match(css, /\.clipboard-chip\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.clipboard-chip\.selected\s*\{[^}]*alpha\(@primary/s);
});

test("compact view has no duplicate new/recent counters", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const css = readText("style.css");
  assert.doesNotMatch(window, /newBadge|compactStatus|jumpToNewest|newKeys/);
  assert.doesNotMatch(css, /\.clipboard-new-badge|\.clipboard-status/);
  assert.match(window, /recentTab/);
  assert.match(window, /pinnedTab/);
});

function functionBodyCss(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `missing CSS selector: ${selector}`);
  const brace = css.indexOf("{", start);
  const end = css.indexOf("}", brace);
  return css.slice(brace + 1, end);
}
