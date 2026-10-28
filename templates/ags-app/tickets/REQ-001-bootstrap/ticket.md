---
id: REQ-001
title: "Bootstrap {{REPO}} from the frozen template"
kind: requirement
status: in-progress
lane: 3
links:
  openspec: none
  bmad: none
worktree: none
branch: main
---

# Bootstrap {{REPO}} from the frozen template

## Requirement

Create the standalone `{{REPO}}` app repo from `ags-clipboard/templates/ags-app/`
with the identity tuple, the real live `palette-refresh` and the standalone dev
flow.

## Acceptance

- [ ] All `{{...}}` tokens replaced and `template.json` deleted.
- [ ] `app.manifest.json` matches `app.tsx` (`{{INSTANCE}}`, `{{CONFIG_DIR}}`,
      window `{{WINDOW}}`, launcher `{{LAUNCHER}}`).
- [ ] `palette-refresh` is a real, non-destructive refresh; one JSON-string
      response; idempotent by appearance hash.
- [ ] `make test`, `make conformance`, `make typecheck`, `make bundle` pass.
- [ ] Annotated tag `v0.1.0` created after the gates.
