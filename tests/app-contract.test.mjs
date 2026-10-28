// ---------------------------------------------------------------------------
// Manifest + handler + template conformance for the ags-clipboard pilot
// (AD-26/AD-27/AD-33/AD-35).
//
// This is the repo-local gate the standalone contract requires:
//   1. `app.manifest.json` is schema-valid and carries the pilot identity;
//   2. app.tsx / window / launcher / history paths agree with that identity;
//   3. the live palette-refresh handler is real (cache clear, Theme pointer,
//      search-icon + card rebuild) and non-destructive;
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

test("the contracts v0.3.0 manifest schema agrees with the platform", () => {
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

test("the Makefile pins the v0.3.0 program tuple", () => {
  const makefile = readText("Makefile");
  assert.match(makefile, /^AGS_PLATFORM_VERSION := v0\.3\.0$/m);
  assert.match(makefile, /^CONTRACTS_VERSION := v0\.3\.0$/m);
});

// ── 3. The live handler is real and non-destructive ────────────────────────

test("app.tsx registers the real palette-refresh handler", () => {
  const app = readText("app.tsx");
  assert.match(app, /from\s+"\.\/lib\/palette-refresh"/);
  assert.match(app, /createClipboardPaletteRefresh\(/);
  assert.match(app, /requestHandler\s*\(/);
  assert.match(
    app,
    /if \(argv\[0\] === PALETTE_REFRESH_COMMAND\)[\s\S]*paletteRefresh\(argv, res\)/,
    "palette-refresh dispatches before the show/hide/toggle surface",
  );
  assert.match(app, /theme\.apply\(\)/, "the stable Theme pointer is re-applied");
  assert.match(app, /refreshClipboardAppearance\(\)/, "the widgets are rebuilt");
});

test("the refresh clears the real token and texture caches", () => {
  const itemCard = readText("ui", "ItemCard.tsx");
  const body = functionBody(itemCard, "export function clearVisualCaches");
  assert.match(body, /tokenCache = null/);
  assert.match(body, /textureCache\.clear\(\)/);
});

test("the refresh surface rebuilds the search icon and cards", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const searchIcon = functionBody(window, "function rebuildSearchIcon");
  assert.match(searchIcon, /uiIcon\("search"/);
  assert.match(searchIcon, /header\.remove\(searchIcon\)/);
  assert.match(searchIcon, /header\.prepend\(next\)/);
  assert.doesNotMatch(searchIcon, /search\.set_text/, "the query entry is untouched");

  assert.match(
    window,
    /appearanceSurfaces\.push\(\{\s*clearCaches: clearVisualCaches,\s*rebuildSearchIcon,\s*rebuildCards: rebuild,/s,
  );
  const refresh = functionBody(window, "export function refreshClipboardAppearance");
  assert.match(refresh, /applyAppearance\(surface\)/);
});

test("the card rebuild preserves overlay visibility, query, selection and list", () => {
  const window = readText("ui", "ClipboardWindow.tsx");
  const rebuild = functionBody(window, "function rebuild(): void");
  assert.doesNotMatch(rebuild, /readHistory\(/);
  assert.doesNotMatch(rebuild, /query\s*=/);
  assert.doesNotMatch(rebuild, /items\s*=/);
  assert.doesNotMatch(rebuild, /paused\s*=/);
  assert.doesNotMatch(rebuild, /jobId\s*=/);
  assert.doesNotMatch(rebuild, /search\.set_text/);
  assert.doesNotMatch(rebuild, /\b(hideWindow|showWindow|toggleWindow)\(/);
  assert.doesNotMatch(rebuild, /\.visible\s*=/);
  assert.doesNotMatch(rebuild, /mapped\s*=/);
  // Selection is retained by index (clamped to the new list), not reset.
  assert.match(rebuild, /if \(selected >= shown\.length\) selected = shown\.length - 1/);
});
