// Manifest + handler + template conformance copied from the template.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseAgsAppManifest } from "ags-platform/ports/app-manifest"
import { checkAppRepoAt } from "ags-platform/conformance/app-conformance"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const IDENTITY = {
  schemaVersion: 1,
  app: "{{APP}}",
  instance: "{{INSTANCE}}",
  configDir: "{{CONFIG_DIR}}",
  mode: "live",
  holdsUnsavedState: false,
}

test("the manifest is valid and agrees with app.tsx", () => {
  const parsed = parseAgsAppManifest(readFileSync(join(ROOT, "app.manifest.json"), "utf8"))
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.manifest, IDENTITY)
  const app = readFileSync(join(ROOT, "app.tsx"), "utf8")
  assert.match(app, /instanceName:\s*"{{INSTANCE}}"/)
  assert.match(app, /createAppPaletteRefresh\(/)
  assert.match(app, /requestHandler/)
})

test("the platform template gate passes", () => {
  const report = checkAppRepoAt(ROOT)
  assert.equal(report.ok, true, JSON.stringify(report.issues))
})
