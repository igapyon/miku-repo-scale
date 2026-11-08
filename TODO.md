# TODO

## Current state

2026-11-07: companion RSC-14 and RSC-15a-b now pass local runtime, bundle,
metric-acceptance, and ZIP checks on macOS / Node 22 and 26. Its hosted
Node/OS matrix is prepared but not run. Product RSC-15 and M1 acceptance remain
open because SR-01 and the `--inventory all` / `--output` path audit remain.
RSC-02, RSC-08 through RSC-13 product implementation work is complete locally.
See the
[remediation plan](docs/self-review-remediation-plan.md) and [language support](docs/language-support.md).

- [x] Confirm repository, work branch, shared rules, and same-layer sister examples.
- [x] Place metadata, repository conventions, design, and local implementation plan.
- [x] RSC-00: add build/test entrypoints and release packaging.
- [ ] RSC-01: schemas now run through a JSON Schema validator; M1 acceptance remains open for SR-01 and the full original checklist.
- [x] RSC-02: select and prototype pinned WASM grammars; document dialect scope, fixtures, source mapping, and 6.42 MB parser-only bundle.
- [ ] RSC-03: invalid-path identity is covered; atomic root/path safety remains open (SR-01).
- [ ] RSC-04: BOM/NUL, injected parent-symlink cases, and UTF-16 line-offset mapping are covered; atomic root-boundary proof remains open (SR-01).
- [x] RSC-05: ordered classification, explicit Shell dialects, known basenames, and supported shebang forms have regression coverage.
- [ ] RSC-06: corrected path identity, diagnostics, and Shell aggregation have focused regression coverage; integrated acceptance remains open.
- [x] RSC-07: CLI, exit status, and new-file output implemented; M1 acceptance remains pending below.
- [x] RSC-08: classify UTF-16 comment ranges onto original physical lines; validate formulas and aggregate the lexical subset.
- [x] RSC-09: connect JavaScript, TypeScript, JSX, and TSX parsers; embed their grammars in standalone bundles and diagnose parse failures.
- [x] RSC-10: connect the Python grammar; classify f-string comments, docstrings, string forms, shebangs, and parse failures.
- [x] RSC-11: Java parser, JLS Unicode escape translation/source mapping, and original physical-line metrics.
- [x] RSC-12: Shell and dialects; map CRLF source ranges and reject selected Bash-only syntax under `sh`. **M2 language-aware measurement is complete; product acceptance remains open.**
- [x] RSC-13: verify Shell-enabled source/dist/CLI/runtime parity, version, and SHA-256 on Node 22/26. Hosted run on a pushed tag remains pending.
- [x] RSC-14 (SKILL): pin and verify the upstream CLI, add a thin adapter, and build an installable bundle.
- [x] RSC-15a-b (SKILL): isolated CLI smoke and metric acceptance for instructions, JSON/JSONL, TypeScript, binary files, and ignore metadata.
- [ ] RSC-15c (SKILL): run hosted Node 22/24/26 and Ubuntu/macOS/Windows matrix; verify Ubuntu ZIP build there.
- [ ] RSC-15d (SKILL): conversation cases and release-readiness review.
- [ ] RSC-15 (APP): product acceptance, OS/Node matrix, handoff of verified artifacts.

Task details and dependencies: [implementation plan](docs/implementation-plan.md).
RSC-14 and skill-specific RSC-15 are owned by `miku-repo-scale-skills`.

## Self-review remediation (2026-11-06)

Execution order: fixture/access boundary → SR-01 → SR-02 → SR-05 → SR-04 → SR-06 → SR-03 → integration acceptance.

- [x] Preserve reproductions as regression fixtures and add filesystem-boundary failure injection.
- [ ] SR-01 / P1: defense-in-depth checks and injected-race regressions are implemented; atomic root-boundary guarantee, `--inventory all`, and `--output` path race audit remain open.
- [x] SR-02 / P1: preserve leading U+FEFF in filenames and detect duplicate result identities.
- [x] SR-05 / P2: treat UTF-8 BOM plus NUL consistently as binary.
- [x] SR-04 / P2: normalize explicit Shell dialects to language=shell and implementation/source defaults.
- [x] SR-06 / P2: retain raw path base64 in summary diagnostics.
- [x] SR-03 / P2: configure artifact creation and attachment on v tag push; actionlint and local release smoke pass.
- [x] Rebuild artifacts; verify source/bundle, schema, Node 22/26, and the three injected read-boundary races.
- [ ] Complete the atomic boundary and `--inventory all` / `--output` audit before closing M1.

Details, expected results, and completion gates: [remediation plan](docs/self-review-remediation-plan.md).

## Release infrastructure (2026-11-06)

- [x] Node.js 26 build, CLI/runtime/source bundles, local staging and isolated smoke.
- [x] Replace the Release `published` trigger with the requested tag-push trigger (SR-03).
- [x] Adjacent miku-soft improvements: clean staging, exact three-file upload set, final-byte smoke.
- [ ] Record hosted workflow execution after the corrected implementation is included in a pushed release tag.
- [x] Binary filename/extension/size metadata, Git tracking, and ignore-rule evidence are included in M1.

## Repository measurement requirements (2026-11-06)

- [x] Define repository-wide totals and the source-code subset as product outputs.
- [x] Include TXT/HTML/JSON/JSONL and other readable text in the M1 basic-measurement design.
- [x] RSC-01/04/06: fixtures for mixed program/document/data/binary repositories,
  unknown extensions, HTML embedded content, and JSONL physical lines.
