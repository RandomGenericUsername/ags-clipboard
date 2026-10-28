# AGENTS.md — {{REPO}} operating contract

Canonical agent instructions for this repo. Claude (`CLAUDE.md` symlinks here),
OpenCode and every BMAD/OpenSpec skill must follow this.

## 1. Evidence rule

Every technical claim carries testable evidence: a file path + line range, a
commit SHA, a URL + quoted section, or an executed command with its result.
Non-trivial claims get `Evidence:` and `Verify:` lines. If evidence does not
exist, write `Evidence: MISSING — run <X>`; never present the claim as fact.

## 2. Identity and layout

The repo root IS the app package (`app.tsx` at the root). Identity is
single-valued in `app.manifest.json`:

```text
app={{APP}}  instance={{INSTANCE}}  configDir={{CONFIG_DIR}}  mode=live
```

- Window: `{{WINDOW}}`; launcher: `{{LAUNCHER}}`; keybind: {{KEYBIND}}.
- No app imports another app. `ags-platform` is the runtime dependency;
  `contracts` is a test-time schema dependency.
- The runtime is the only palette-refresh trigger. Do not subscribe to
  `wallpaper.state` for palette application.

## 3. Ticket flow

All work starts in `tickets/` (`_template/`, `INDEX.md`, `LIFECYCLE.md`).
Never work on main: `scripts/worktree-guard.sh check-clean` then
`scripts/worktree-guard.sh create <id> <slug>`. Record `worktree=` and
`branch=` in the ticket.

## 4. Gates

- `make test` and `make conformance` are the stock-runner CI gates.
- `make typecheck` and `make bundle` are LOCAL: they need `ags` and GIR.
- CI has no self-hosted runner and no secrets.
- `.dev/`, `node_modules/`, `@girs/`, generated `tsconfig.json` and bundle
  output are never committed.

## 5. Live refresh invariants

- Exactly one JSON-string response, through `createPaletteRefreshHandler`.
- Idempotent by appearance hash; a throw is retryable and not recorded applied.
- Clear caches before rebuilding widgets.
- Preserve visible surface, query, selection and unsaved/domain state.

## 6. Releases

Immutable annotated tags; a published tag is never moved. Installed tags are
read-only and writable state lives under XDG paths (AD-37). Tag only after
`make gates` passes.
