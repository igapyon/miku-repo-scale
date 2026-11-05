# Development

## Current state

2026-11-05: documentation and repository scaffold only. `src/`, `scripts/`, and
`tests/` are reserved for the planned implementation; no CLI or build/test
entrypoints are advertised yet. Version `0.1.0` is initial package metadata,
not evidence of a published or working release.

The current checkout starts on `devel-tiga1105wch`. Always inspect actual Git
state before work; do not reset to that historical branch name.

## Runtime and implementation

- Product: JavaScript ESM (`.mjs`), minimum Node.js 22, and Git.
- Release-build baseline: Node.js 26; planned verification lines: 22, 24, 26.
- Production dependencies: none at scaffold time. Select lexers in RSC-02.
- `npm test`, build, CLI, exports, and artifact smoke are implemented in the
  corresponding tasks before they are documented as usable commands.

See [implementation-plan.md](implementation-plan.md) and [design.md](design.md).
The authoritative product core, diagnostics, and result contract live here.

## Artifact and release preparation

The planned outputs are an executable CLI, an importable core runtime, and a
curated source archive. A proposed release workflow is kept at
[templates/release-cli-runtime-bundles.yml](templates/release-cli-runtime-bundles.yml).
It becomes active under `.github/workflows/` in RSC-13 after build/smoke commands
exist and artifacts pass checks. This avoids advertising an executable release
pipeline before its local product build exists.

The shared executable workflow reference uses `release: published`; the basic
design document still contains a tag-push example. For this project, the
workflow-specific reference owns execution steps, so the template follows
`release: published`. Record future changes with their reason.

## Repository operation rules

Use `workplace/` for scratch data and only track its `.gitkeep`. Do not commit
dependencies, generated bundles, `.DS_Store`, or local `.codex/skills/` copies.
Maintain README, TODO, and actual verification results together. Shared basic
documents are linked from [miku-soft-reference.md](miku-soft-reference.md).

## Initial scaffold verification (2026-11-05)

Prepared files were checked in an isolated staging directory before placement:

- `npm install --package-lock-only --ignore-scripts --offline`: both empty dependency sets locked.
- JSON parsing: 4 metadata/lock files across the two repositories passed.
- `node --check`: all 3 packaging helpers passed syntax checks.
- Local Markdown links: 43 references resolved, including the preserved target LICENSE files.
- Skill `npm run build:bundle`: failed with the expected missing required CLI diagnostic; no bundle output was created.

This verifies scaffold preparation and the missing-runtime boundary. No product
measurement tests, usable runtime, real bundle smoke, or hosted workflows were run.
