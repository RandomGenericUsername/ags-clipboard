---
id: REQ-008
title: "Refresh the local ags-platform pin to v1.0.1"
kind: requirement
status: in-progress
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

- [ ] `Makefile` pins `AGS_PLATFORM_VERSION := v1.0.1` and leaves
      `CONTRACTS_VERSION := v0.8.0`.
- [ ] `.github/workflows/ci.yml` checks out and asserts
      `.dev/ags-platform/v1.0.1`.
- [ ] `tests/app-contract.test.mjs` asserts the `v1.0.1` / `v0.8.0` tuple; no
      executed test still asserts `v1.0.0`.
- [ ] `README.md`, `AGENTS.md` and `CHANGELOG.md` state the `v1.0.1` /
      `v0.8.0` tuple.
- [ ] App source, handler/ack behavior, `style.css`, layout tokens and lane
      policy are byte-identical to `main`.
- [ ] `make gates` passes on the branch with the local overrides.
- [ ] The branch fast-forwards into `main`, is annotated as `v0.6.1`, and
      `main` plus the tag are pushed.
