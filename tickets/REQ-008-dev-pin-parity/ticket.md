---
id: REQ-008
title: "Refresh the local ags-platform pin to v1.0.1"
kind: requirement
status: done
lane: direct
links:
  openspec: none
  bmad: none
worktree: .worktrees/REQ-008/
branch: ticket/REQ-008-dev-pin-parity
---

# Refresh the local ags-platform pin to v1.0.1

## Requirement

Bring the app's local development pin to the current platform patch without
touching app behavior:

- Move `ags-platform` from `v1.0.0` to `v1.0.1` in the Makefile, CI,
  conformance/validation tests and the README/AGENTS/CHANGELOG.
- Keep `contracts` at `v0.8.0`; the contract tuple does not move.
- `app.tsx`, `lib/`, `ui/`, `style.css`, the layout tokens and the
  `appearance-refresh <genHash>` handler/ack behavior are unchanged.
- The local `ags-platform` tag `v1.0.1` is the peak tag consumed by this app;
  no newer platform tag is used.

This is a pin-parity change only. It does not adopt new platform behavior,
add a command, or alter the overlay.

## Acceptance

- [x] `Makefile` pins `AGS_PLATFORM_VERSION := v1.0.1` and leaves
      `CONTRACTS_VERSION := v0.8.0`.
- [x] `.github/workflows/ci.yml` checks out and asserts
      `.dev/ags-platform/v1.0.1`.
- [x] `tests/app-contract.test.mjs` asserts the `v1.0.1` / `v0.8.0` tuple; no
      executed test still asserts `v1.0.0`.
- [x] `README.md`, `AGENTS.md` and `CHANGELOG.md` state the `v1.0.1` /
      `v0.8.0` tuple.
- [x] App source, handler/ack behavior, `style.css`, layout tokens and lane
      policy are byte-identical to `main`.
- [x] `make gates` passes on the branch with the local overrides.
- [x] The branch fast-forwards into `main`, is annotated as `v0.6.1`, and
      `main` plus the tag are pushed.

## Implementation

- `Makefile`: `AGS_PLATFORM_VERSION := v1.0.1`; `CONTRACTS_VERSION` stays
  `v0.8.0`. The tuple comment and the `help` text point at
  `.dev/ags-platform/v1.0.1`.
- `.github/workflows/ci.yml`: the checkout `ref`, checkout `path` and
  tuple-presence assertion all use `.dev/ags-platform/v1.0.1`; the contracts
  checkout stays `v0.8.0`.
- `tests/app-contract.test.mjs`: the tuple test and its assertion match
  `v1.0.1`; the handler-result message names `v1.0.1`. No executed test still
  asserts `v1.0.0`.
- `tests/validation/appearance-migration.test.mjs`: the applied-work message
  names `v1.0.1`.
- `README.md`, `AGENTS.md`: the program tuple and local symlink path state
  `v1.0.1` / `v0.8.0`. `CHANGELOG.md` gains the `v0.6.1` pin-parity entry.
- No app source changed: `app.tsx`, `lib/`, `ui/`, `style.css` and
  `app.manifest.json` are byte-identical to `main`.

## Evidence

### Source checks

- `Makefile:9-10` pins `AGS_PLATFORM_VERSION := v1.0.1` and
  `CONTRACTS_VERSION := v0.8.0`; `Makefile:27-28` documents the
  `.dev/ags-platform/v1.0.1` path.
- `.github/workflows/ci.yml:38-39` checks out `ref: v1.0.1` at
  `.dev/ags-platform/v1.0.1`; `:45` keeps `contracts` `v0.8.0`; `:50` asserts
  the platform file exists at the v1.0.1 path.
- `tests/app-contract.test.mjs:259-261` asserts the `v1.0.1` / `v0.8.0`
  Makefile tuple; `:294` names v1.0.1 in the applied-work assertion.
  `tests/validation/appearance-migration.test.mjs:157` does the same.
  `grep -rn "v1\.0\.0" tests` returns no matches.
- `README.md:76,81`, `AGENTS.md:61` and `CHANGELOG.md:3-9` state the `v1.0.1` /
  `v0.8.0` tuple.
- Source parity: `git diff --stat main -- app.tsx lib ui style.css
  app.manifest.json` is empty.
- Local tuple: `git -C ../ags-platform describe --tags --exact-match` →
  `v1.0.1`; `git -C ../contracts describe --tags --exact-match` → `v0.8.0`;
  `git -C ../ags-platform tag --sort=-v:refname | head -1` → `v1.0.1`.

### Gates

Command (worktree root):

```sh
AGS_PLATFORM_DEV=/home/inumaki/Development/dotfiles/ags-platform \
CONTRACTS_ROOT=/home/inumaki/Development/dotfiles/contracts \
make gates
```

Result: exit 0. Full log:
`/tmp/opencode/ags-clipboard-req008-gates.log`.

| Gate | Result |
| --- | --- |
| `make test` | 13/13 pass (unit + theme roles + appearance migration) |
| `make conformance` | 13/13 pass, including the platform `checkAppRepo` template gate and the v1.0.1 / v0.8.0 pin |
| `make drift` | 41 checks, all passed against contracts v0.8.0 |
| `make bundle` | `build/ags-clipboard.js`, 957,648 bytes |
| `make typecheck` | 0 errors in the ags-clipboard tree (27 tolerated `/usr/share/ags/js` errors, 0 platform errors) |

Environment note: the first `make gates` run in the fresh worktree ended at
`typecheck: platform link missing` because `make deps` ran `npm install` after
`platform-dev` created the `node_modules/ags-platform` symlink. The rerun above
passed; no repo file was changed to work around it. This is the same ordering
note recorded by REQ-004, REQ-006 and REQ-007.

## Release and merge

- Planning commit: `899a051` — `docs(REQ-008): start ags-platform v1.0.1 pin parity ticket`.
- Implementation commit: `e92a2ba` — `chore(REQ-008): pin ags-platform v1.0.1`.
- This closeout commit is fast-forwarded into `main` (no merge commit), then
  annotated as `v0.6.1` and pushed with `main`.
- This repo's convention is tag-only: releases are immutable annotated tags and
  there is no GitHub Release step (the only workflow is
  `.github/workflows/ci.yml`). No GitHub Release object is created.
- No existing tag is moved; `v0.1.0` … `v0.6.0` remain untouched.

## Deviations

- Historical references in the closed REQ-007 ticket/INDEX line and the frozen
  `templates/ags-app/` copy still say `v1.0.0`; they describe the prior release
  and are intentionally not rewritten by a pin-parity change.
- No app behavior changed, so no runtime screenshot/e2e was captured. The gates
  prove the pin, the unchanged source, the bundled imports and the typecheck.
