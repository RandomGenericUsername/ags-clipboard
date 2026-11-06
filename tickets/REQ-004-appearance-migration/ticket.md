---
id: REQ-004
title: "Migrate the clipboard app to the v2 appearance plane"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-004/
branch: ticket/REQ-004-appearance-migration
---

# Migrate the clipboard app to the v2 appearance plane

## Requirement

Adopt the unified Appearance plane (contracts `v0.7.0`, `ags-platform`
`v0.9.0`) in the clipboard app. The runtime (`v0.9.1`) publishes palette, skin
and mode as one immutable generation behind the single repointed hop
`$XDG_STATE_HOME/dotfiles/current/appearance`; consumers watch that hop and
read `$XDG_CONFIG_HOME/<configDir>/appearance.css` plus its `tokens.json`.

`app.tsx` declares one module-level
`createAppearance({ configDir: "ags-clipboard" })` and `main()` calls
`appearance.apply()`. The split `theme.apply()` / `skin.apply()` startup is
removed, as are the v1 Theme/Skin imports.

The `palette-refresh` handler becomes
`createAppearanceRefreshHandler(appearance, work)`. The platform helper always
re-applies the whole appearance before the app-owned `work`; `work` keeps the
existing non-destructive clipboard behavior (clear the visual caches, rebuild
the static search icon, rebuild the cards) and does not call `theme.apply()`.
The single `requestHandler` and the fixed `PALETTE_REFRESH_COMMAND` dispatch
stay unchanged; no new request command is added. Idempotence by appearance
hash and any deferred/failed outcome remain platform-owned.

The card width becomes the TSX-owned layout token
`appearance.value("layout.ags-clipboard.card-width", 260)` (read with `peek()`
where a plain number is required) instead of the hard-coded `260`. The
`style.css` glass fallback, selectors, class vocabulary, gestures, geometry and
behavior do not change. `ui/ItemCard.tsx` keeps its role-luminance contrast
math; replacing it with v2 ink tokens is a recorded follow-up, not this ticket.

The local pins move to `ags-platform` `v0.9.0` / `contracts` `v0.7.0`; gates
run with the local overrides
`AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform` and
`CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts`.

## Acceptance

- [x] `app.tsx` imports `createAppearance`, declares one module-level
      `createAppearance({ configDir: "ags-clipboard" })`, and calls
      `appearance.apply()` in `main()`; no `theme`/`skin` import or apply call
      survives.
- [x] The palette-refresh wiring is
      `createAppearanceRefreshHandler(appearance, work)`, where `work` only
      rebuilds the clipboard surface (caches, search icon, cards). There is
      still exactly one `requestHandler`; no new request command is added.
- [x] The card width comes from
      `appearance.value("layout.ags-clipboard.card-width", 260)` rather than a
      hard constant.
- [x] `style.css` remains present with the bundled glass fallback; selectors,
      geometry, class vocabulary, gestures and behavior are unchanged.
- [x] The local Makefile pins `ags-platform` `v0.9.0` / `contracts` `v0.7.0`.
- [x] A source-level validation test asserts the appearance apply/configDir
      wiring, the appearance-refresh handler, and the absence of theme/skin
      calls, plus the retained `style.css` fallback.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch merges fast-forward to `main`, the next minor tag is created,
      and the tag + gate evidence are recorded in this ticket.
- [x] `ItemCard` contrast math is recorded as a follow-up (v2 ink tokens can
      replace it later).

## Implementation

- `app.tsx`: imports `createAppearance` and
  `createAppearanceRefreshHandler`; declares one module-level
  `createAppearance({ configDir: "ags-clipboard" })`; `main()` calls
  `appearance.apply()` once. The single `requestHandler` still dispatches the
  fixed `PALETTE_REFRESH_COMMAND` first, so no request command changed.
- `app.tsx`: `paletteRefresh` is
  `createAppearanceRefreshHandler(appearance, () => refreshClipboardAppearance())`.
  The platform helper re-applies the whole appearance and owns hash
  idempotence/deferral; the work callback keeps the cache clear + search-icon +
  card rebuild and no longer calls `theme.apply()`.
- `app.tsx` / `ui/ClipboardWindow.tsx` / `ui/ItemCard.tsx`: the card width is
  `appearance.value("layout.ags-clipboard.card-width", 260)`; the reactive
  accessor is passed to the overlay and read with `peek()` when each card is
  built. `ItemCard` no longer contains a hard-coded `260`.
- `lib/appearance.ts`: keeps only the pure `applyAppearance` widget order.
  `lib/palette-refresh.ts` and the app-local `createAppearanceRefresh` hash
  bookkeeping are removed because `createAppearanceRefreshHandler` owns them.
- `tests/validation/appearance-migration.test.mjs` (replaces
  `skin-consumption.test.mjs`): asserts the one app-scoped appearance, its
  apply in `main()`, the `createAppearanceRefreshHandler(appearance, work)`
  wiring, the layout-token card width, absence of Theme/Skin calls, the single
  request handler, and the retained `style.css` fallback.
- `Makefile`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`,
  `CHANGELOG.md`, `tests/app-contract.test.mjs`: pin/describe the
  `ags-platform` v0.9.0 / `contracts` v0.7.0 tuple.

## Evidence

### Source checks

- `app.tsx:4-5` imports the Appearance adapter and refresh helper;
  `app.tsx:23` declares the one `ags-clipboard` appearance; `app.tsx:37-39`
  wires the platform refresh handler; `app.tsx:86` calls `appearance.apply()`.
- `app.tsx:27` reads `layout.ags-clipboard.card-width` with fallback `260`;
  `app.tsx:88` passes the accessor to the overlay;
  `ui/ClipboardWindow.tsx:169` reads it with `peek()`;
  `ui/ItemCard.tsx:180` applies it with `set_size_request(cardWidth, -1)`.
- `app.tsx` has no `theme`/`skin` import or apply call. The only handler is the
  single `requestHandler` at `app.tsx:66`; `PALETTE_REFRESH_COMMAND` still
  dispatches before the show/hide/toggle surface.
- Source-gate evidence: `tests/validation/appearance-migration.test.mjs`
  passes, including the absence of `createAppSkin|createAppSkinValue`,
  `ags-platform/adapters/theme|skin`, `theme.apply()` and `skin.apply()`.
- `style.css` is unchanged by this ticket; the gate re-asserts the panel
  `alpha(@surface, 0.92)` + `16px` radius and the card
  `alpha(@surface, 0.45)` fallbacks.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-clipboard-req004-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 10/10 pass (unit + theme roles + `tests/validation/appearance-migration.test.mjs`) |
| `make conformance` | 13/13 pass, including the platform `checkAppRepo` template gate and the v0.9.0 / v0.7.0 pin assertion |
| `make drift` | all checks passed against contracts v0.7.0 |
| `make bundle` | `build/ags-clipboard.js`, 910,572 bytes |
| `make typecheck` | 0 errors in the ags-clipboard tree (27 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Local platform checkout: `/home/inumaki/Development/dotfiles/ags-platform`
(`git describe --tags --exact-match` → `v0.9.0`); contracts
`/home/inumaki/Development/dotfiles/contracts` → `v0.7.0`.

Environment note: the first `make gates` invocation in the fresh worktree
ended at `typecheck: platform link missing` because `make deps` ran `npm
install` after `platform-dev` and pruned the just-created
`node_modules/ags-platform` symlink. After `@girs/` and TypeScript existed, the
rerun above linked the platform and passed. No repo file was changed to work
around it.

## Release and merge

- Planning commit: `c71608d` — `docs(REQ-004): start v2 appearance migration ticket`.
- Implementation commit: `d40810e` — `feat(REQ-004): migrate to the v2 appearance plane`.
- This closeout commit records the evidence, is fast-forwarded into `main`
  (no merge commit), then annotated as `v0.4.0` after the gates above.
- No existing tag is moved; `v0.1.0`, `v0.2.0` and `v0.3.0` remain untouched.
  Nothing is pushed.

## Deviations

- `templates/ags-app/` keeps its frozen v1 Theme template/pins: this ticket
  scopes the migration to the app package, as prior app-local tickets did.
- The app-local `lib/palette-refresh.ts` and `createAppearanceRefresh` hash
  bookkeeping were removed instead of kept as dead wrappers: the platform
  helper now owns the transport, hash idempotence and deferred/failed outcomes.
- No runtime screenshot/e2e was captured. This ticket changes imports,
  startup/refresh wiring and the card-width source only; the bundle gate proves
  the Appearance adapter resolves, typecheck proves the accessor types, and the
  source gate pins the wiring.

## Follow-ups (not this ticket)

- `ui/ItemCard.tsx` still derives the on-dark/on-light header ink from palette
  role luminance. Re-evaluate that contrast math once the v2 `ink` tokens are
  consumed directly; do not half-refactor it here.
