# TODO

## Current state

2026-11-08: PR #4 merged product version `0.2.2`; version `0.2.3` is committed
locally and `0.2.4` is prepared locally. To keep the Node.js + Git single-file
runtime simple, the product uses best-effort filesystem checks and does not
promise isolation from malicious concurrent path replacement. M1 local
acceptance passed all 43 tests on
Node.js 26.12.1 and 22.23.4 on macOS, and the artifact check passed. Hosted
OS/Node verification and release readiness remain open. Companion RSC-14
and RSC-15a-b pass local runtime, bundle, metric-acceptance, and ZIP checks on
macOS / Node 22 and 26; its hosted Node/OS matrix has not run against the
refreshed runtime. See the
[remediation plan](docs/self-review-remediation-plan.md) and
[language support](docs/language-support.md).

- [x] Confirm repository, work branch, shared rules, and same-layer sister examples.
- [x] Place metadata, repository conventions, design, and local implementation plan.
- [x] RSC-00: add build/test entrypoints and release packaging.
- [x] RSC-01: schemas and runtime invariants validate under the documented filesystem scope; local M1 acceptance passed.
- [x] RSC-02: select and prototype pinned WASM grammars; document dialect scope, fixtures, source mapping, and 6.42 MB parser-only bundle.
- [x] RSC-03: Git inventory, invalid-path identity, static symlink handling, and metadata are covered; malicious concurrent path replacement is outside the product guarantee (SR-01).
- [x] RSC-04: BOM/NUL, selected injected parent-symlink cases, decode limits, and UTF-16 line mapping pass under the documented best-effort scope (SR-01).
- [x] RSC-05: ordered classification, explicit Shell dialects, known basenames, and supported shebang forms have regression coverage.
- [x] RSC-06: corrected path identity, diagnostics, Shell aggregation, and integrated metrics pass local acceptance.
- [x] RSC-07: CLI, exit status, and new-file output pass local acceptance.
- [x] RSC-08: classify UTF-16 comment ranges onto original physical lines; validate formulas and aggregate the lexical subset.
- [x] RSC-09: connect JavaScript, TypeScript, JSX, and TSX parsers; embed their grammars in standalone bundles and diagnose parse failures.
- [x] RSC-10: connect the Python grammar; classify f-string comments, docstrings, string forms, shebangs, and parse failures.
- [x] RSC-11: Java parser, JLS Unicode escape translation/source mapping, and original physical-line metrics.
- [x] RSC-12: Shell and dialects; map CRLF source ranges and reject selected Bash-only syntax under `sh`. **M2 language-aware measurement and local acceptance are complete; hosted OS/Node verification remains open.**
- [x] RSC-13: verify Shell-enabled source/dist/CLI/runtime parity, version, and SHA-256 on Node 22/26. Hosted run on a pushed tag remains pending.
- [x] RSC-14 (SKILL): pin and verify the upstream CLI, add a thin adapter, and build an installable bundle.
- [x] RSC-15a-b (SKILL): isolated CLI smoke and metric acceptance for instructions, JSON/JSONL, TypeScript, binary files, and ignore metadata.
- [ ] RSC-15c (SKILL): run hosted Node 22/24/26 and Ubuntu/macOS/Windows matrix; verify Ubuntu ZIP build there.
- [ ] RSC-15d (SKILL): conversation cases and release-readiness review.
- [ ] RSC-15 (APP): local Node 22/26 reacceptance and artifact check pass; hosted OS/Node matrix and artifact handoff remain.

Task details and dependencies: [implementation plan](docs/implementation-plan.md).
RSC-14 and skill-specific RSC-15 are owned by `miku-repo-scale-skills`.

## Self-review remediation (2026-11-06)

Execution order: fixture/access boundary → SR-01 → SR-02 → SR-05 → SR-04 → SR-06 → SR-03 → integration acceptance.

- [x] Preserve reproductions as regression fixtures and add filesystem-boundary failure injection.
- [x] SR-01 / P1 scope decision: preserve the Node.js + Git single-file runtime; accept best-effort path checks and document concurrent hostile path replacement as out of scope.
- [x] SR-02 / P1: preserve leading U+FEFF in filenames and detect duplicate result identities.
- [x] SR-05 / P2: treat UTF-8 BOM plus NUL consistently as binary.
- [x] SR-04 / P2: normalize explicit Shell dialects to language=shell and implementation/source defaults.
- [x] SR-06 / P2: retain raw path base64 in summary diagnostics.
- [x] SR-03 / P2: configure artifact creation and attachment on v tag push; actionlint and local release smoke pass.
- [x] Rebuild artifacts; verify source/bundle, schema, Node 22/26, and the three injected read-boundary races.
- [x] Complete product reacceptance under the documented threat model; hosted OS/Node verification remains open.

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
