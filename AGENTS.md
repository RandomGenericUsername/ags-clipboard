# AGENTS.md — ags-clipboard operating contract

Canonical agent instructions for this repo. Claude (`CLAUDE.md` symlinks here),
OpenCode and every BMAD/OpenSpec skill must follow this.

## 1. Evidence rule (hard requirement)

No suggestion "in the air". Every technical claim, recommendation or design
decision carries testable evidence: a file path + line range, a commit SHA, a
URL + quoted section, or an executed command with its result.

Format: non-trivial claims get `Evidence:` and `Verify:` lines. If evidence
does not exist yet, write `Evidence: MISSING — run <X>` and do not present the
claim as fact. Prefer executed output over recalled text.

## 2. What this repo is

`ags-clipboard` is the standalone clipboard-history overlay and the pilot for
the standalone AGS app contract (spine AD-25…AD-37). The repo root is the app
package: `app.tsx` lives at the root, never in a subdirectory.

Identity is single-valued and enforced by `app.manifest.json`:

```text
app=clipboard  instance=clipboard  configDir=ags-clipboard
mode=live      holdsUnsavedState=false
```

- Window: `clipboard-window`; launcher: `clipboard-ui`; keybind description:
  “Open clipboard history”.
- No app imports another app. Depend on `ags-platform` (and `contracts` at test
  time only), never on a sibling app repo.
- The runtime is the only appearance-refresh trigger. Do not subscribe to
  `wallpaper.state` for palette application and do not invent a palette event.

## 3. Ticket flow

All work starts as a ticket in `tickets/` (`_template/`, vocab + rollup in
`INDEX.md`, flow in `LIFECYCLE.md`). App-local work is ticketed here; cross-app
program work stays in `ags-apps` until archive.

Never work on main: `scripts/worktree-guard.sh check-clean` before starting and
`scripts/worktree-guard.sh create <id> <slug>` to branch + worktree. Record
`worktree=` and `branch=` in the ticket. Keep changes small, verifiable and
committable; never mix planning edits with implementation in one turn.

## 4. Local gates vs stock CI

**Local is authoritative for typecheck.** CI runs only stock-runner jobs
(`ubuntu-latest`): `make test`, `make conformance` and `make drift`. There is
no self-hosted runner and no CI secret dependency.

- `make test` — pure unit tests. Node only; nothing imports `gi://*` or `ags/*`.
- `make conformance` — manifest identity, live handler and template gate.
- `make drift` — shared event client against the canonical `contracts` tuple.
- `make typecheck` — LOCAL: needs `ags` on PATH plus GIR/Astal; generates
  machine-specific `@girs/` and `env.d.ts` (gitignored).
- `make bundle` — LOCAL: `ags bundle app.tsx build/ags-clipboard.js`.
- `make gates` — all of the above.

The program tuple is `ags-platform` v1.0.1 / `contracts` v0.8.0, local-only in
this run. `.dev/` is gitignored; never commit a fetched platform,
`node_modules/`, `@girs/`, generated `tsconfig.json` or bundle output.

## 5. Release

Releases are immutable annotated tags (`v0.1.0`, …). A published tag is never
moved. Installed tags are read-only; writable state lives under XDG paths, never
inside the tag. Tag only after `make gates` passes, and record the evidence in
the release ticket.

## 6. Appearance-refresh invariants

The platform's `createAppearanceRefreshHandler` owns the Generations v3
protocol: exactly one JSON-string response per `appearance-refresh <genHash>`
request, idempotent by generation hash, and the requested generation is
re-applied before app work. `lib/appearance.ts` is pure and executed by tests;
it owns only the non-destructive widget order:

- cache clear happens before the search-icon and card rebuilds;
- overlay visibility, query, selection and clipboard state are preserved.

`make conformance` asserts these source invariants and the platform
`checkAppRepo` template gate. Do not weaken them to make a test pass.

## 7. Appearance plane (Generations v3)

`app.tsx` declares one module-level
`createAppearance({ configDir: "ags-clipboard" })` and `main()` calls
`appearance.apply()`. The adapter watches only
`$XDG_STATE_HOME/dotfiles/current`, verifies `current/manifest.json`, and reads
`current/appearance/ags-clipboard.css` plus `tokens.json`; those carry the
composed palette, skin and mode. The one refresh command is the v3
`appearance-refresh <genHash>`; the work returns `{ status: "applied" }` so the
helper can answer with the requested hash. There is no separate skin-refresh
request and the retired `palette-refresh` command is not accepted. `style.css`
remains the bundled glass fallback. Layout is TSX-owned: the card width is
`layout.ags-clipboard.card-width` (fallback `260`), read with `peek()` where GTK
needs a plain number.
