# Changelog

## v0.1.0 — 2026-10-27

- Extract the clipboard-history overlay from `ags-apps` v0.5.0 into the
  standalone `ags-clipboard` repo (repo root is the app package).
- Full identity rename: app/instance `clipboard`, config dir `ags-clipboard`,
  window `clipboard-window`, launcher `clipboard-ui`, keybind description
  “Open clipboard history”.
- Read history/images from the runtime `clipboard` namespace.
- Implement the real `palette-refresh`: clear token/texture caches, re-apply
  the Theme pointer, rebuild the search icon and cards, preserve overlay
  visibility/query/selection/clipboard state; idempotent by appearance hash.
- Add the standalone dev flow (`AGENTS.md`, tickets, worktree guard, Makefile,
  CI, tests, `templates/ags-app/`) and the manifest/handler conformance gate.
- Pin the local-only v0.3.0 `ags-platform`/`contracts` tuple via `.dev/`.
