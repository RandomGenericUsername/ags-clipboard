#!/usr/bin/env node
// Appearance migration gate (REQ-004; Generations v3 in REQ-007).
//
// The clipboard app consumes the unified appearance plane without redesigning
// the overlay: the platform adapter installs one composed provider and owns the
// single watched hop, while this app only applies it and rebuilds its own
// derived widgets. These assertions pin the app-side contract so a later change
// cannot silently re-introduce the split Theme/Skin pair, the retired v2
// refresh command, a second refresh path, or drop the bundled fallback:
//
//   1. app.tsx declares one createAppearance scoped to ags-clipboard;
//   2. main() applies the appearance once; no theme/skin call survives;
//   3. the appearance-refresh handler is
//      createAppearanceRefreshHandler(appearance, work) where work only
//      rebuilds the clipboard surface and returns the v3 applied result;
//   4. the card width comes from the layout token, not a hard constant;
//   5. style.css still carries the bundled glass fallback.
//
// Static, no desktop stack needed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AGS = resolve(HERE, "../..");

const read = (...parts) => readFileSync(join(AGS, ...parts), "utf8");

/**
 * Strip comments before scanning. The appearance contract is documented in
 * prose that names the old Theme/Skin pair and the refresh paths; raw text
 * would make documentation read as the behavior it describes.
 */
function stripComments(text) {
  let out = "";
  let state = null; // "line" | "block" | a quote character
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (state === "line") {
      if (c === "\n") {
        state = null;
        out += c;
      }
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        state = null;
        i += 1;
      }
      continue;
    }
    if (state !== null) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 1;
      } else if (c === state) {
        state = null;
      }
      continue;
    }
    if (c === "/" && next === "/") {
      state = "line";
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      state = "block";
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") state = c;
    out += c;
  }
  return out;
}

const app = stripComments(read("app.tsx"));
const window = stripComments(read("ui", "ClipboardWindow.tsx"));
const itemCard = stripComments(read("ui", "ItemCard.tsx"));

// ── 1. One app-scoped Appearance ──────────────────────────────────────────

assert.match(
  app,
  /import \{ createAppearance \} from "ags-platform\/adapters\/appearance"/,
  "app.tsx must import the app-scoped Appearance factory",
);
assert.match(
  app,
  /const appearance = createAppearance\(\{\s*configDir: "ags-clipboard",?\s*\}\)/,
  "the module-level appearance must be scoped to the ags-clipboard config dir",
);
assert.equal(
  (app.match(/createAppearance\(/g) ?? []).length,
  1,
  "exactly one app-scoped appearance is created",
);

// ── 2. Startup applies the whole appearance; the split pair is gone ───────

const mainStart = app.indexOf("main()");
assert.ok(mainStart >= 0, "app.tsx lost main()");
const main = app.slice(mainStart);
assert.equal(
  (main.match(/appearance\.apply\(\)/g) ?? []).length,
  1,
  "the appearance is applied exactly once at startup",
);

for (const forbidden of [
  /createAppSkin|createAppSkinValue/,
  /ags-platform\/adapters\/(?:theme|skin)/,
  /\btheme\.apply\(\)/,
  /\bskin\.apply\(\)/,
]) {
  assert.doesNotMatch(
    app,
    forbidden,
    `app.tsx still reaches the retired Theme/Skin plane: ${forbidden}`,
  );
}

// ── 3. The refresh handler is the platform appearance helper ──────────────

assert.equal(
  (app.match(/requestHandler\s*\(/g) ?? []).length,
  1,
  "keep exactly one request handler; Appearance adds no request path",
);
assert.match(
  app,
  /if \(argv\[0\] === APPEARANCE_REFRESH_COMMAND\)[\s\S]*appearanceRefresh\(argv, res\)/,
  "the v3 appearance-refresh dispatch stays first",
);
assert.match(
  app,
  /const appearanceRefresh = createAppearanceRefreshHandler\(appearance,/,
  "the appearance-refresh wiring must use createAppearanceRefreshHandler(appearance, work)",
);
assert.doesNotMatch(app, /PALETTE_REFRESH_COMMAND|ports\/palette-refresh/);
assert.doesNotMatch(app, /skin-refresh|SKIN_REFRESH/);
assert.doesNotMatch(app, /wallpaper\.state/);

const refreshStart = app.indexOf("const appearanceRefresh");
const handlerStart = app.indexOf("requestHandler(");
assert.ok(refreshStart >= 0 && handlerStart > refreshStart);
const refresh = app.slice(refreshStart, handlerStart);
assert.match(refresh, /refreshClipboardAppearance\(\)/, "the clipboard surface is rebuilt");
assert.match(
  refresh,
  /return \{ status: "applied" \}/,
  "v1.0.1 requires an explicit applied work result",
);
assert.doesNotMatch(
  refresh,
  /\b(?:theme|skin)\.apply\(\)/,
  "the platform helper already re-applies the whole appearance",
);
assert.doesNotMatch(
  refresh,
  /appearance\.apply\(\)/,
  "work must not double-apply; the helper owns the appearance apply",
);

// ── 4. Card width is the TSX-owned layout token ───────────────────────────

assert.match(
  app,
  /appearance\.value\(\s*"layout\.ags-clipboard\.card-width",\s*260\s*\)/,
  "the card width must come from the ags-clipboard layout token, with 260 as fallback",
);
assert.match(
  app,
  /ClipboardWindow\(monitor, cardWidth\)/,
  "the accessor is passed to the overlay instead of a duplicated constant",
);
assert.match(
  window,
  /ItemCard\(item, index \+ 1, select, openLink, cardWidth\.peek\(\)\)/,
  "every card is built from the current layout token, read with peek()",
);
assert.doesNotMatch(itemCard, /set_size_request\(260,/, "the hard card width is gone");
assert.match(itemCard, /set_size_request\(cardWidth, -1\)/);

// ── 5. Bundled glass fallback survives ───────────────────────────────────

assert.match(app, /import style from "\.\/style\.css"/);
const css = read("style.css");
assert.match(
  css,
  /\.clipboard-panel\s*\{[^}]*background-color:\s*alpha\(@surface,\s*0\.92\)/s,
  "style.css must keep the glass panel fallback",
);
assert.match(
  css,
  /\.clipboard-panel\s*\{[^}]*border-radius:\s*16px/s,
  "style.css must keep the panel radius fallback",
);
assert.match(
  css,
  /\.clipboard-card\s*\{[^}]*background-color:\s*alpha\(@surface,\s*0\.45\)/s,
  "style.css must keep the glass card fallback",
);
