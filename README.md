# ags-clipboard

Standalone AGS clipboard-history overlay. This is the REQ-009 pilot for the
standalone app contract: the repo root **is** the app package.

| Field | Value |
| --- | --- |
| Repo | `ags-clipboard` |
| App id | `clipboard` |
| AGS instance | `clipboard` |
| Config dir | `ags-clipboard` |
| Window | `clipboard-window` |
| Launcher | `clipboard-ui` |
| Keybind description | Open clipboard history |
| Manifest mode | `live` (`holdsUnsavedState: false`) |

`app.manifest.json` is the single identity source. The runtime discovers the
deployed config link, requires `manifest.instance == app.tsx instanceName ==
ags list`, and requires `manifest.configDir == the deployed link basename`.

## Runtime contract

### Data paths

The runtime clipboard daemon owns the data; the overlay reads the same
documents:

- history: `$XDG_STATE_HOME/clipboard/history.json`
- images: `$XDG_CACHE_HOME/clipboard/`
- daemon config: `$XDG_CONFIG_HOME/clipboard/config.json`

The daemon performs the one-time migration from the retired namespace; this
app never reads the old paths. Writable state stays outside the installed tag
(AD-37).

### `appearance-refresh`

The runtime invokes `ags request appearance-refresh <genHash> -i clipboard`
after an appearance change. `createAppearanceRefreshHandler` resolves and
re-applies exactly that generation first, then the app:

1. clears the rasterized-icon texture cache;
2. rebuilds the static search glyph from the new palette;
3. rebuilds the visible cards from the **same** in-memory clipboard list.

Overlay visibility, the search query, the selected index and clipboard state
are never reset. The handler is idempotent by generation hash and answers with
exactly one generation-bound JSON string (`{"applied":"<genHash>"}`,
`{"deferred":"reason","genHash":"<genHash>"}` or
`{"failed":"reason","retryable":bool,"genHash":"<genHash>"}`), via
`ags-platform/ports/appearance-refresh`. The retired v2 `palette-refresh`
command and its `{"ok":true}` acknowledgement are not accepted. A wallpaper
change never restarts the process.

### Appearance plane (Generations v3)

`app.tsx` declares one module-level
`createAppearance({ configDir: "ags-clipboard" })`; `main()` calls
`appearance.apply()` once. The adapter watches only
`$XDG_STATE_HOME/dotfiles/current`, verifies `current/manifest.json`, and reads
`current/appearance/ags-clipboard.css` plus its `tokens.json`. The runtime
composes palette, skin and mode into that one immutable generation, and the
platform installs it as one USER-priority provider over the bundled `style.css`
glass fallback. Missing artifacts are a no-op, so the bundled fallback keeps
today's rendering. Card header ink is a static `on_*` role map in `style.css`;
the app does no palette parsing or luminance math.

The card width is the TSX-owned layout token
`layout.ags-clipboard.card-width` (fallback `260`), read through
`appearance.value(...)` with `peek()` where GTK needs a plain number. No
skin-refresh request is added; the one fixed `appearance-refresh <genHash>`
command is the only appearance trigger.

## Local development

The program tuple is `ags-platform` `v1.0.1` / `contracts` `v0.8.0` /
`dotfiles-assets` `v0.12.0`. Those tags are local-only in this run; the local
gates use a gitignored symlink under `.dev/`.

```sh
ln -s ../../../ags-platform .dev/ags-platform/v1.0.1   # or use AGS_PLATFORM_DEV
make test          # pure unit + palette-role tests (Node only)
make conformance   # manifest + handler + template gate
make drift         # shared event client <-> contracts drift gate
make typecheck     # LOCAL desktop stack: ags + GIR declarations
make bundle        # LOCAL: `ags bundle app.tsx build/ags-clipboard.js`
make gates         # all of the above
```

`make test`, `make conformance` and `make drift` are the stock-runner gates.
Typecheck is local and authoritative; CI deliberately has no self-hosted job
(AD-19/AD-23).

Run the app:

```sh
ags run -d .
ags request toggle -i clipboard
```

## Repo layout

```text
app.tsx                  AGS entry point (instance clipboard)
app.manifest.json        identity tuple
lib/                     pure models, history access, refresh core
ui/                      ClipboardWindow, ItemCard, Preview
tests/                   pure unit + manifest/handler/template conformance
tickets/                 LIFECYCLE, INDEX, _template, this repo's tickets
scripts/worktree-guard.sh
templates/ags-app/       frozen copyable template for the next app repo
.github/workflows/ci.yml stock-runner CI (make ci)
```

## Creating the next app repo

Copy `templates/ags-app/` to the new repo root, fill the placeholders declared
in `templates/ags-app/template.json`, then run `make test` and
`make conformance`. No generator is required. Keep the template frozen per
release (AD-33).

## Consumer surfaces

`dotfiles-v3` owns the app list; `dotfiles-provision` installs the tag and
links `config/ags-clipboard`; `dotfiles-assets` owns the keybind described as
**Open clipboard history** and the `clipboard-ui` launcher. This repo does not
provision or edit those repos; it proves only the app-side contract.
