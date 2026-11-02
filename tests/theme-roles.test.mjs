#!/usr/bin/env node
// palette.v1 role gate for the clipboard stylesheet.
//
// The sheet was written against CSG's positional carrier names. Under the
// `ags-platform` v0.4.0 Theme provider those carriers resolve to Material
// roles, so a carrier-index migration would silently break the per-type card
// hues and the state colors. This gate pins the outcome instead: no
// CSS/TS/TSX file may reference a legacy carrier, every `@role` the sheet
// uses must be declared by `palette.v1`, and the ItemCard contrast picker must
// use the exact role its header is filled with.
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

test("the ItemCard TYPE_TOKEN map matches each header fill", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  const block = itemCard.match(/const TYPE_TOKEN:[^{]+\{([\s\S]*?)\n\}/);
  assert.notEqual(block, null, "ui/ItemCard.tsx must declare TYPE_TOKEN");
  const tokens = new Map(
    [...block[1].matchAll(/(\w+):\s*"([a-z0-9_]+)"/g)].map((m) => [m[1], m[2]]),
  );

  const css = readText("style.css");
  const heads = new Map(
    [...css.matchAll(/\.kind-(\w+) \.clipboard-head \{\s*background-color: @([a-z0-9_]+);/g)].map(
      (m) => [m[1], m[2]],
    ),
  );

  assert.deepEqual([...tokens.keys()].sort(), [...heads.keys()].sort());
  for (const [kind, role] of tokens) {
    assert.equal(
      heads.get(kind),
      role,
      `.kind-${kind} header uses @${heads.get(kind)} but TYPE_TOKEN says ${role}`,
    );
  }
});

test("the six per-type roles stay distinct", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  const block = itemCard.match(/const TYPE_TOKEN:[^{]+\{([\s\S]*?)\n\}/);
  const roles = [...block[1].matchAll(/(\w+):\s*"([a-z0-9_]+)"/g)].map((m) => m[2]);
  assert.equal(roles.length, 6);
  assert.equal(new Set(roles).size, 6, "each item kind keeps its own hue role");
});
