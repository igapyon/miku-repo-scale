# Development

## Current state

2026-11-06: version `0.2.0` implements M1 repository measurement, result/config
schemas, CLI output, import API, standalone bundles, and source/dist/bundle
parity. Self-review remediation is in progress; the atomic root-boundary gate
and M1 acceptance remain open. RSC-02 selected the WASM parser family, RSC-08
implemented common comment-range classification, and RSC-09 connected
JavaScript/TypeScript/JSX/TSX. The next active task is RSC-10 Python integration.
SR-01 remains a recorded concern. See [language support](language-support.md) and the
[remediation plan](self-review-remediation-plan.md).

The initial checkout was `devel-tiga1105wch`; the current work branch can differ.
Always inspect actual Git state before work; do not reset to a historical name.

## Runtime and implementation

- Product: JavaScript ESM (`.mjs`), minimum Node.js 22, and Git.
- Release-build baseline: Node.js 26. Node.js 22 is locally verified; Node 24
  and the broader OS matrix remain pending.
- The distributed `.mjs` files have no npm runtime dependencies. Exact parser
  and grammar development dependencies are embedded into the generated
  standalone bundles; Python, Java, and Shell are not connected yet.
- Build-only dependency: esbuild 0.28.2 (MIT), locked exactly. Node.js has no
  built-in ESM bundler; esbuild bundles module/JSON imports without maintaining
  a source-rewriting bundler. The distributed `.mjs` files need no npm install.
- Test-only dependency: Ajv 8.20.0 (MIT), locked exactly, validates the published
  JSON Schema contracts. It is not bundled in the runtime artifacts.
- Source archives use the system `tar` command (available on GitHub's Ubuntu
  runner). Archive entries are sorted and curated; byte-identical archives
  across different hosts/timestamps are not currently promised.

## Local commands

```sh
npm ci
npm test
npm run smoke:bundle
npm run smoke:runtime
npm run check:artifacts
TAG_NAME=v0.2.0 npm run stage:release
TAG_NAME=v0.2.0 npm run check:release
```

`npm test` uses `pretest` to run `build` and `build:bundle`. `build` generates
standalone `dist/cli.mjs` and `dist/runtime.mjs` from JavaScript ESM, targeting
Node.js 22. `build:bundle` verifies those files and produces the two `.mjs`
files and curated source archive in `bundle/`. Version values in package.json
and both package-lock root fields must agree.

`stage:release` first validates the tag and all three input files, then replaces
`release-assets/` with exactly three versioned files. `check:release` checks the
final filenames and runs each `.mjs` from an isolated directory with spaces and
Japanese characters, without the source tree or node_modules.

The runtime exports `analyze(options)` and frozen metadata:
`{ name, version, stage: "m1", analysisAvailable: true, rulesetVersion: "1.1.0" }`.
`analyze` returns the `miku-repo-scale.result/v1` envelope. JSON Schema files
and runtime invariants are kept under `schemas/` and `src/contracts.mjs`.

The CLI accepts `analyze [root]`, `--include`, `--exclude`, `--inventory`,
`--encoding`, `--max-file-bytes`, `--config`, `--detail`, and `--output`.
Tracked worktree content is measured. `--inventory all` adds untracked and
ignored metadata only. Readable text of any extension receives bytes and
physical-line metrics. JavaScript and TypeScript files receive lexical metrics;
Python, Java, and Shell remain basic-only with `unsupported` comment analysis.

See [implementation-plan.md](implementation-plan.md) and [design.md](design.md).
The authoritative product core, diagnostics, and result contract live here.

## Artifact and release preparation

The active workflow is
[release-cli-runtime-bundles.yml](../.github/workflows/release-cli-runtime-bundles.yml).
Push a Git tag `v<package-version>` or `v<package-version>.N`,
where N is a positive integer with no leading zero. For package `0.2.0`,
`v0.2.0` and `v0.2.0.2` are accepted; `v0.2.1`, `.notes`, and `.0` are rejected.
The suffix changes asset filenames, while embedded metadata stays `0.2.0`.

The workflow runs only on `v*` tag pushes. It checks out that exact tag,
installs locked dependencies, builds and tests on Node.js 26, stages
CLI/runtime/source assets, and verifies the staged bytes on Node.js 22 before
creating or updating the tag's GitHub Release. It attaches only
`release-assets/*` after checking the exact file set. Use a new tag whose
commit contains this implementation; previous tags cannot build files added
later.

## Repository operation rules

Use `workplace/` for scratch data and only track its `.gitkeep`. Do not commit
dependencies, generated bundles, `.DS_Store`, or local `.codex/skills/` copies.
Maintain README, TODO, and actual verification results together. Shared basic
documents are linked from [miku-soft-reference.md](miku-soft-reference.md).

## Initial scaffold verification (2026-11-05)

Historical scaffold checks, before the preview implementation:

- `npm install --package-lock-only --ignore-scripts --offline`: both empty dependency sets locked.
- JSON parsing: 4 metadata/lock files across the two repositories passed.
- `node --check`: all 3 packaging helpers passed syntax checks.
- Local Markdown links: 43 references resolved, including the preserved target LICENSE files.
- Skill `npm run build:bundle`: failed with the expected missing required CLI diagnostic; no bundle output was created.

This verifies scaffold preparation and the missing-runtime boundary. No product
measurement tests, usable runtime, real bundle smoke, or hosted workflows were run.

## Release infrastructure verification (2026-11-06)

- `npm ci --offline --cache workplace/.npm-cache` succeeded from the lockfile.
- `npm test` on Node 26.12.1 built the artifacts and passed 8 packaging tests:
  source/bundle CLI parity, isolated imports, exact staging, tag rejection,
  missing files, lockfile mismatch, stale runtime metadata, and curated sources.
- The same 8 tests passed on official Node 22.23.4. Its archive SHA-256 was
  checked against the official Node distribution checksum list.
- `TAG_NAME=v0.2.0 npm run stage:release` and final `check-artifacts.mjs release`
  on Node 22.23.4 passed for the three versioned assets.
- actionlint 1.7.12 passed for the release workflow; the temporary tool download
  was checked against its publisher's checksum list.
- The source archive was extracted into a separate temporary directory.
  Offline `npm ci`, build, bundle, and artifact checks succeeded there; rebuilt
  CLI/runtime bytes matched the original bundles exactly.

These were packaging checks on macOS before the M1 analysis core. GitHub
execution and the broader Node/OS matrix remain pending.

## M1 implementation verification (2026-11-06)

- `npm test` on Node.js 26.12.1 built CLI/runtime/source assets and passed all
  19 tests, including hand-counted CRLF/LF/CR, empty and binary content,
  UTF-16 BOM, strict decode failure, size limits, ignore sources and negation,
  tracked/untracked inventory, config rules, output refusal, and deterministic
  source/dist/bundle parity for `ok`, `partial`, and `error` results.
- The test set uses temporary Git repositories and checks root/nested
  `.gitignore`, `.git/info/exclude`, and global exclude evidence. It confirms
  untracked content is never included in measured byte or line totals.
- Runtime and CLI bundles run from isolated directories without the source
  tree or `node_modules`. Hosted GitHub Actions and Windows/Linux execution
  have not been run.
- With those Node 26-built assets, all 19 tests also passed on Node.js 22.23.4.

## Self-review and remediation planning (2026-11-06)

The 19-test result predates the six review findings and does not establish their
correctness. Targeted temporary-repository reproductions showed an out-of-root
read during a parent-symlink race, leading-U+FEFF path aliasing, a Shell dialect
classification error, UTF-8 BOM/NUL binary inconsistency, and missing raw path
identity in summary diagnostics. The workflow originally used Release
published instead of the requested tag push; SR-03 records the correction.

The [remediation plan](self-review-remediation-plan.md) records the order,
regression expectations, and M1 reacceptance gate. SR-02, SR-04, SR-05, and
SR-06 have targeted passing regressions. The reader has a filesystem adapter
with checks around open/read, and injected parent-symlink swaps at the three
planned checkpoints caused zero reads from the outside sentinel. This does not
prove atomic root-boundary resolution against every concurrent rename schedule;
SR-01 remains an acceptance gate. The tag-push workflow is updated. Historical
19-test verification above predates the corrections and remains historical.

## Self-review remediation verification (2026-11-06)

- Node.js 26.12.1 `npm test`: build and all 25 tests passed. The suite includes
  raw-byte invalid paths, U+FEFF filename identity, UTF-8 BOM plus NUL, Shell
  dialect aggregation, the three injected symlink races, real Ajv schema
  validation, and source/dist/bundle parity.
- Node.js 22.23.4, against the Node 26-built artifacts:
  `node --test tests/analysis.test.mjs tests/artifacts.test.mjs` passed all 25
  tests. Tag validation, staging, and final three-file release smoke passed.
- `npm run check:artifacts` passed on Node.js 26.12.1. actionlint 1.7.12 passed
  for the `push.tags: ["v*"]` workflow. Release assets were staged for tag
  version `0.2.0`; the current release asset SHA-256 values are:

  | Asset | SHA-256 |
  | --- | --- |
  | `miku-repo-scale-0.2.0.mjs` | `858d8ee1a810650168e7127ab484a860b05f3209687ae223ad44feee4c8a0431` |
  | `miku-repo-scale-runtime-0.2.0.mjs` | `d1a58430af0083db3ac5cc02c303f7e5548204bfccd88c4929375cff2bc27fc9` |

  The source archive checksum is not recorded in this document because the
  archive contains this development record; the staged file is checked by the
  release artifact smoke. No GitHub tag was pushed and no hosted run occurred.
- Race injection and symlink tests ran on macOS (Darwin arm64). Windows, Linux,
  Node.js 24, and GitHub hosted execution remain untested.
- The reader's parent checks reduce the reproduced race but do not provide an
  atomic path-to-handle guarantee. `--inventory all` recursive enumeration
  and `--output` parent checks also need the same boundary audit. The
  UTF-16 offset helper and known basename/shebang classification are now
  implemented and covered. M1 acceptance remains open for filesystem bounds.

## RSC-02 parser selection verification (2026-11-06)

- Locked the exact MIT development dependencies recorded in
  [language-support.md](language-support.md). `npm install` reported zero
  vulnerabilities.
- Prototyped JavaScript, TypeScript, TSX, Python, Java, and Bash with the
  hand-authored lexer fixtures. The valid cases returned no parser error nodes;
  five malformed snippets returned parser errors. The Java experiment
  demonstrated that JLS Unicode-escape translation must precede parsing and
  that translated ranges need an original-source map.
- esbuild 0.28.2 embedded the runtime and all six grammars into one
  6,422,960-byte `.mjs`. That file executed on Node.js 26.12.1 and Node.js
  22.23.4 outside the source tree and loaded every grammar. This is a
  parser-only prototype, not the integrated M2 artifact.
- `npm run build:bundle`, `TAG_NAME=v0.2.0 npm run stage:release`, and
  `TAG_NAME=v0.2.0 npm run check:release` completed. The staged source archive
  contains the parser decision document and all five lexer fixtures.
- RSC-02 and RSC-09 are complete. RSC-08's common classifier is connected to
  JavaScript/TypeScript and their standalone artifacts. Python, Java, and Shell
  are next. Zsh remains
  explicitly unsupported for comment/code metrics, and Java's full JLS
  backslash-eligibility algorithm remains to be implemented in RSC-11.

## RSC-08 common lexical line metrics (2026-11-06)

- Added `classifyLexicalLines(text, commentRanges)` with UTF-16 half-open ranges,
  bounds/overlap validation, and blank-line priority for ASCII-whitespace-only
  lines, including empty lines inside multi-line comments.
- Connected lexical file metrics to `classified_lines` in total and grouped
  aggregates. Expanded the result schema and runtime invariants for the
  classified subset and its line-count equations.
- `node --test tests/lexical-lines.test.mjs`: 6 tests passed. Full
  `npm test`: build succeeded and all 31 tests passed on Node.js 26.12.1.
- At this stage, language parsers were not yet wired to the classifier; RSC-09
  connected JavaScript/TypeScript in the following implementation step.

## RSC-09 JavaScript and TypeScript (2026-11-06)

- Connected JavaScript, TypeScript, JSX, TSX, and `.d.ts` parser modes to the
  common UTF-16 comment-range classifier. Shebangs count as code.
- Embedded the pinned runtime and all grammar WASM payloads in the standalone
  CLI/runtime bundles. Direct source execution still loads the locked package
  assets. The public `analyze()` call remains synchronous after module import.
- Parse failures preserve bytes and basic physical-line values, leave lexical
  metrics `null`, and emit a `LEXICAL_ERROR` warning. Python, Java, and Shell
  remain unsupported until RSC-10 through RSC-12.
- `RULESET_VERSION` is `1.1.0`; the result schema and package version stay at
  v1 and `0.2.0` respectively.
- `npm test`: all 33 tests passed on Node.js 26.12.1. On Node.js 22.23.4,
  both focused parser tests passed and `node scripts/check-artifacts.mjs all`
  passed; that check runs the generated files isolated from source and
  `node_modules`.
- Integrated artifact sizes: CLI 6,507,990 bytes; runtime 6,502,819 bytes.
