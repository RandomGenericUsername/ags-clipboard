#!/usr/bin/env node
// palette.v1 role gate for the clipboard stylesheet.
//
// The sheet was written against CSG's positional carrier names. Under the
// `ags-platform` v0.4.0 Theme provider those carriers resolve to Material
// roles, so a carrier-index migration would silently break the per-type card
// hues and the state colors. This gate pins the outcome instead: no
// CSS/TS/TSX file may reference a legacy carrier, every `@role` the sheet
// uses must be declared by `palette.v1`, and each card kind's header ink must
// be the static Material `on_*` counterpart of its fill. The app must not read
// the palette artifact or compute contrast at runtime.
//
// The forbidden token is assembled from pieces so this test itself stays clean
// under the repo-wide absence grep.
//
// Static, no desktop stack needed. Run with: node --test tests/theme-roles.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE_V1_ROLES } from "ags-platform/ports/palette";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "@girs",
  "build",
  ".dev",
  ".worktrees",
]);
const EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function readText(...parts) {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

const LEGACY_TOKEN = new RegExp("@" + "color" + "_[a-z0-9_]+", "g");

//: Header fill -> the Material ink role that belongs to that fill. `code` is
//: the neutral `surface_container_lowest` head, which has no `on_*` sibling;
//: its deterministic ink is `@on_surface`.
const HEADER_INK = {
  text: ["tertiary", "on_tertiary"],
  code: ["surface_container_lowest", "on_surface"],
  color: ["error", "on_error"],
  image: ["error_container", "on_error_container"],
  link: ["primary", "on_primary"],
  emoji: ["secondary", "on_secondary"],
};

test("no legacy positional carrier token survives in CSS/TS/TSX", () => {
  const legacy = [];
  for (const file of walk(ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(LEGACY_TOKEN)) {
      legacy.push(`${relative(ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(
    legacy,
    [],
    "legacy positional carriers are back; map the site to a palette.v1 role:\n" +
      legacy.join("\n"),
  );
});

test("every @role in the stylesheets is a declared palette.v1 role", () => {
  const declared = new Set(PALETTE_V1_ROLES);
  for (const file of ["style.css", "templates/ags-app/style.css"]) {
    const css = readText(...file.split("/"));
    for (const match of css.matchAll(/@([a-z][a-z0-9_]*)/g)) {
      assert.ok(
        declared.has(match[1]),
        `${file} references undeclared palette role @${match[1]}`,
      );
    }
  }
});

test("each card kind's header uses its fill's static on_* ink", () => {
  const css = readText("style.css");
  const heads = new Map(
    [
      ...css.matchAll(
        /\.kind-(\w+) \.clipboard-head \{\s*background-color: @([a-z0-9_]+);\s*color: @([a-z0-9_]+);\s*\}/g,
      ),
    ].map((match) => [match[1], [match[2], match[3]]]),
  );

  assert.deepEqual(
    Object.fromEntries(heads),
    HEADER_INK,
    "every .kind-* header must set its fill and matching on_* ink in CSS",
  );
});

test("the six per-type header fills stay distinct", () => {
  const fills = Object.values(HEADER_INK).map(([fill]) => fill);
  assert.equal(fills.length, 6);
  assert.equal(new Set(fills).size, 6, "each item kind keeps its own hue role");
});

test("the header ink classes and runtime luminance math are gone", () => {
  const css = readText("style.css");
  assert.doesNotMatch(css, /\.clipboard-head\.on-(?:dark|light)\b/);
  assert.doesNotMatch(css, /\bon-(?:dark|light)\b/);

  const itemCard = readText("ui", "ItemCard.tsx");
  for (const forbidden of [
    /colors\.css/,
    /gi:\/\/GLib/,
    /\brelativeLuminance\b/,
    /\bpaletteTokens\b/,
    /\btokenCache\b/,
    /\bheaderTextClass\b/,
    /\bon-(?:dark|light)\b/,
  ]) {
    assert.doesNotMatch(
      itemCard,
      forbidden,
      `ui/ItemCard.tsx still carries the runtime ink workaround: ${forbidden}`,
    );
  }

  const clearStart = itemCard.indexOf("export function clearVisualCaches");
  assert.notEqual(clearStart, -1, "ui/ItemCard.tsx must keep clearVisualCaches");
  const clearBody = itemCard.slice(clearStart, itemCard.indexOf("function relativeTime"));
  assert.match(clearBody, /textureCache\.clear\(\)/);
  assert.doesNotMatch(clearBody, /tokenCache/);
});
