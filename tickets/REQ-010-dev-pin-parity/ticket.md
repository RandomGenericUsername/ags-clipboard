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

- [ ] `Makefile` pins `AGS_PLATFORM_VERSION := v1.1.0` and
      `CONTRACTS_VERSION := v0.12.0`.
- [ ] `.github/workflows/ci.yml` checks out and asserts
      `.dev/ags-platform/v1.1.0` and `contracts` `v0.12.0`.
- [ ] `tests/app-contract.test.mjs` and
      `tests/validation/appearance-migration.test.mjs` assert the
      `v1.1.0` / `v0.12.0` tuple; no executed test still asserts
      `v1.0.1` / `v0.8.0` as the current pin.
- [ ] `README.md`, `AGENTS.md` and `CHANGELOG.md` state the `v1.1.0` /
      `v0.12.0` tuple.
- [ ] App source, handler/ack behavior, `style.css`, layout tokens and lane
      policy are byte-identical to `main`.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch fast-forwards into `main`, is annotated as `v0.6.2`, and
      `main` plus the tag are pushed.

## Done-when

`make gates` passes with the `v1.1.0` / `v0.12.0` tuple, the app source is
unchanged, and `main` plus annotated tag `v0.6.2` are pushed.
