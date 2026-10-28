// Pure unit tests copied from the template. Node only; no AGS/GTK imports.
import { test } from "node:test"
import assert from "node:assert/strict"
import { PALETTE_REFRESH_COMMAND } from "ags-platform/ports/palette-refresh"
import { applyAppearance } from "../lib/appearance.ts"
import { createAppPaletteRefresh } from "../lib/palette-refresh.ts"

test("appearance refresh clears caches before rebuilding widgets", () => {
  const calls = []
  applyAppearance({
    clearCaches: () => calls.push("clear"),
    rebuildSearchIcon: () => calls.push("search"),
    rebuildCards: () => calls.push("cards"),
  })
  assert.deepEqual(calls, ["clear", "search", "cards"])
})

test("palette-refresh answers once with the protocol JSON string", () => {
  const responses = []
  let applies = 0
  const handler = createAppPaletteRefresh(() => {
    applies += 1
  })
  handler([PALETTE_REFRESH_COMMAND, "hash"], (response) => responses.push(response))
  assert.equal(applies, 1)
  assert.deepEqual(responses, [JSON.stringify({ ok: true })])
})
