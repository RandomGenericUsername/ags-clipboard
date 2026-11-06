#!/usr/bin/env node
// App-scoped skin consumption gate (REQ-003).
//
// The clipboard app consumes the frozen skin plane without redesigning the
// overlay: the platform composes and installs the app-scoped skin provider at
// USER priority, and this app only orders it after the palette. These
// assertions pin the app-side contract so a later change cannot silently add a
// second refresh path or drop the bundled fallback:
//
//   1. app.tsx declares one createAppSkin scoped to ags-clipboard;
//   2. main() applies theme.apply() then skin.apply(), once each;
//   3. the request surface is unchanged and does not reach the skin;
//   4. style.css still carries the bundled glass fallback.
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
 * Strip comments before scanning. The skin contract is documented in prose that
 * names the artifacts and refresh paths; raw text would make documentation read
 * as the behavior it describes.
 */
function stripComments(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "/*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (two === "//") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    out += text[i];
  }
  return out;
}

const app = stripComments(read("app.tsx"));

// ── 1. One app-scoped Skin ────────────────────────────────────────────────

assert.match(
  app,
  /import \{ createAppSkin \} from "ags-platform\/adapters\/skin"/,
  "app.tsx must import the app-scoped Skin factory",
);
assert.match(
  app,
  /const skin = createAppSkin\(\{\s*configDir: "ags-clipboard",?\s*\}\)/,
  "the module-level skin must be scoped to the ags-clipboard config dir",
);
assert.equal(
  (app.match(/createAppSkin\(/g) ?? []).length,
  1,
  "exactly one app-scoped skin is created",
);
assert.doesNotMatch(
  app,
  /createAppSkinValue/,
  "this app has no v1 layout tokens; do not add a token accessor",
);

// ── 2. Startup order: palette first, app-scoped skin last ─────────────────

const mainStart = app.indexOf("main()");
assert.ok(mainStart >= 0, "app.tsx lost main()");
const main = app.slice(mainStart);
const themeAt = main.indexOf("theme.apply()");
const skinAt = main.indexOf("skin.apply()");
assert.ok(themeAt >= 0, "app.tsx lost theme.apply() in main()");
assert.ok(skinAt > themeAt, "skin.apply() must run after theme.apply()");
assert.equal(
  (app.match(/skin\.apply\(\)/g) ?? []).length,
  1,
  "the skin is applied once at startup, not requested in place",
);

// ── 3. The request surface is unchanged ───────────────────────────────────

assert.equal(
  (app.match(/requestHandler\s*\(/g) ?? []).length,
  1,
  "keep exactly one request handler; the skin adds no request path",
);
assert.match(
  app,
  /if \(argv\[0\] === PALETTE_REFRESH_COMMAND\)[\s\S]*paletteRefresh\(argv, res\)/,
  "the existing palette-refresh dispatch stays first",
);
assert.doesNotMatch(app, /skin-refresh|SKIN_REFRESH/);
assert.doesNotMatch(app, /wallpaper\.state/);

const handlerStart = app.indexOf("requestHandler(");
assert.ok(handlerStart >= 0 && mainStart > handlerStart);
assert.doesNotMatch(
  app.slice(handlerStart, mainStart),
  /\bskin\b/,
  "the skin must not be reachable from the request handler",
);

// The palette-refresh handler itself keeps applying only the theme pointer.
const refreshStart = app.indexOf("const paletteRefresh");
assert.ok(refreshStart >= 0 && handlerStart > refreshStart);
const refresh = app.slice(refreshStart, handlerStart);
assert.match(refresh, /theme\.apply\(\)/);
assert.match(refresh, /refreshClipboardAppearance\(\)/);
assert.doesNotMatch(refresh, /\bskin\b/);

// ── 4. Bundled glass fallback survives ────────────────────────────────────

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
