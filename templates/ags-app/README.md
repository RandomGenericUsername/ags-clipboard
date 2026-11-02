# {{REPO}}

Standalone AGS app repo, copied from `templates/ags-app/` (AD-33).

| Field | Value |
| --- | --- |
| App id | `{{APP}}` |
| AGS instance | `{{INSTANCE}}` |
| Config dir | `{{CONFIG_DIR}}` |
| Window | `{{WINDOW}}` |
| Launcher | `{{LAUNCHER}}` |
| Keybind description | {{KEYBIND}} |

`app.manifest.json` is the identity source. The deployed config link basename
must equal `{{CONFIG_DIR}}`, and `ags list` must report `{{INSTANCE}}`.

## Gates

```sh
make test          # pure unit tests (stock runner)
make conformance   # manifest + handler + template gate (stock runner)
make typecheck     # LOCAL desktop stack
make bundle        # LOCAL: ags bundle app.tsx build/{{APP}}.js
make gates         # all of the above
```

The program tuple is `ags-platform` v0.4.0 / `contracts` v0.3.0. Locally those tags are
symlinked under `.dev/` (gitignored); CI checks them out explicitly.

## Replace

Every `{{...}}` token is documented in `template.json`. Delete `template.json`
and the copied ticket placeholder after the first ticket is written. Keep this
template frozen in the pilot repo, not in the generated app.
