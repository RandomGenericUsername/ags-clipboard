---
id: REQ-010
title: "Refresh the local pin tuple to ags-platform v1.1.0 / contracts v0.12.0"
kind: requirement
status: in-progress
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-010/
branch: ticket/REQ-010-dev-pin-parity
---

# Refresh the local pin tuple to ags-platform v1.1.0 / contracts v0.12.0

## Requirement

Bring the app's local development pin to the current program tuple without
touching app behavior:

- Move `ags-platform` from `v1.0.1` to `v1.1.0` in the Makefile, CI,
  conformance/validation tests and the README/AGENTS/CHANGELOG.
- Move `contracts` from `v0.8.0` to `v0.12.0` in the same places.
- `app.tsx`, `lib/`, `ui/`, `style.css`, the layout tokens and the
  `appearance-refresh <genHash>` handler/ack behavior are unchanged.
- `ags-platform` `v1.1.0` is the peak tag consumed by this app; `contracts`
  `v0.12.0` is the peak contracts tag consumed by this app.

This is a pin-parity change only. `v1.1.0` is API-compatible for consumers that
use `value(...)` and the generation apply/ack API; its new required
`surface.window` role belongs to the runtime/assets/composition plane, not this
app. No app command, handler, lane or UI/UX behavior is added or altered.

## Acceptance

- [x] `Makefile` pins `AGS_PLATFORM_VERSION := v1.1.0` and
      `CONTRACTS_VERSION := v0.12.0`.
- [x] `.github/workflows/ci.yml` checks out and asserts
      `.dev/ags-platform/v1.1.0` and `contracts` `v0.12.0`.
- [x] `tests/app-contract.test.mjs` and
      `tests/validation/appearance-migration.test.mjs` assert the
      `v1.1.0` / `v0.12.0` tuple; no executed test still asserts
      `v1.0.1` / `v0.8.0` as the current pin.
- [x] `README.md`, `AGENTS.md` and `CHANGELOG.md` state the `v1.1.0` /
      `v0.12.0` tuple.
- [x] App source, handler/ack behavior, `style.css`, layout tokens and lane
      policy are byte-identical to `main`.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch fast-forwards into `main`, is annotated as `v0.6.2`, and
      `main` plus the tag are pushed.

## Done-when

`make gates` passes with the `v1.1.0` / `v0.12.0` tuple, the app source is
unchanged, and `main` plus annotated tag `v0.6.2` are pushed.

## Implementation

- `Makefile`: `AGS_PLATFORM_VERSION := v1.1.0`; `CONTRACTS_VERSION := v0.12.0`.
  The tuple comment, `help` text, contract-drift comment and local symlink path
  point at `v1.1.0`.
- `.github/workflows/ci.yml`: the checkout `ref`, checkout `path` and
  tuple-presence assertion all use `.dev/ags-platform/v1.1.0`; the contracts
  checkout uses `v0.12.0`.
- `tests/app-contract.test.mjs`: the Makefile tuple test and its assertions
  match `v1.1.0` / `v0.12.0`; the contracts-schema and applied-work messages
  name `v0.12.0` / `v1.1.0`.
- `tests/validation/appearance-migration.test.mjs`: the applied-work message
  names `v1.1.0`.
- `README.md`, `AGENTS.md`: the program tuple and local symlink path state
  `v1.1.0` / `v0.12.0`. `CHANGELOG.md` gains the `v0.6.2` pin-parity entry.
- No app source changed: `app.tsx`, `lib/`, `ui/`, `style.css` and
  `app.manifest.json` are byte-identical to `main`/`v0.6.1`.

## Evidence

### Source checks

- `Makefile:10-11` pins `AGS_PLATFORM_VERSION := v1.1.0` and
  `CONTRACTS_VERSION := v0.12.0`; `Makefile:28,94` document the `v1.1.0` path
  and the `v0.12.0` drift checkout.
- `.github/workflows/ci.yml:38-39` checks out `ref: v1.1.0` at
  `.dev/ags-platform/v1.1.0`; `:45` checks out `contracts` `v0.12.0`; `:50`
  asserts the platform file exists at the `v1.1.0` path.
- `tests/app-contract.test.mjs:240,259-261` asserts the `v0.12.0` schema and
  the `v1.1.0` / `v0.12.0` Makefile tuple; `:294` names `v1.1.0` in the
  applied-work assertion. `tests/validation/appearance-migration.test.mjs:157`
  does the same.
- `README.md:105,110`, `AGENTS.md:61` and `CHANGELOG.md:3-14` state the
  `v1.1.0` / `v0.12.0` tuple.
- Source parity: `git diff --stat v0.6.1 -- app.tsx lib ui style.css
  app.manifest.json` is empty.
- Local tuple: `git -C ../ags-platform describe --tags --exact-match` →
  `v1.1.0`; `git -C ../contracts describe --tags --exact-match` → `v0.12.0`.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-clipboard-req010-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 13/13 pass (unit + theme roles + appearance migration) |
| `make conformance` | 13/13 pass, including the platform `checkAppRepo` template gate and the v1.1.0 / v0.12.0 pin |
| `make drift` | 41 checks, all passed against contracts v0.12.0 |
| `make bundle` | `build/ags-clipboard.js`, 960,656 bytes |
| `make typecheck` | 0 errors in the ags-clipboard tree (27 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Environment note: the first `make gates` run in the fresh worktree ended at
`typecheck: platform link missing` because `make deps` ran `npm install` after
the `platform-dev` prerequisite had already created the
`node_modules/ags-platform` symlink. The rerun above passed; no repo file was
changed to work around it. This is the same ordering note recorded by REQ-004,
REQ-006, REQ-007 and REQ-008.

## Release and merge

- Planning commit: `523181f` — `docs(REQ-010): start ags-platform v1.1.0 / contracts v0.12.0 pin parity ticket`.
- Implementation commit: `1025ae2` — `chore(REQ-010): pin ags-platform v1.1.0 / contracts v0.12.0`.
- This closeout commit is fast-forwarded into `main` (no merge commit), then
  annotated as `v0.6.2` and pushed with `main`.
- This repo's convention is tag-only: releases are immutable annotated tags and
  there is no GitHub Release step. No GitHub Release object is created.
- No existing tag is moved; `v0.1.0` … `v0.6.1` remain untouched.

## Deviations

- Historical references in the closed REQ-007/REQ-008 tickets, prior CHANGELOG
  entries, `tickets/INDEX.md` history and the frozen `templates/ags-app/` copy
  still name the older tuple; they describe prior releases and are
  intentionally not rewritten by a pin-parity change.
- `contracts` `v0.12.0` requires `surface.window` in every resolved appearance
  generation, and `ags-platform` `v1.1.0` enforces it. That group belongs to the
  runtime/assets/composition plane; this app only calls `value(...)` and the
  generation apply/ack API, so no app-side migration was made here.
- No app behavior changed, so no runtime screenshot/e2e was captured. The gates
  prove the pin, the unchanged source, the bundled imports and the typecheck.
