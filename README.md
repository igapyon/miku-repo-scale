# miku-repo-scale

Measure the size and composition of an entire Git repository: program code,
Agent instructions, definitions, documents, text data, generated files, and
binary assets. Repository totals and the source-code subset are both useful.

**Status: M1 local acceptance passed on macOS with Node.js 22 and 26 under the
documented filesystem scope.** Version `0.2.4` is released; SR-01 is an explicit
best-effort limitation. The product OS/Node matrix and companion skill's hosted
acceptance remain open. See the
[remediation plan](docs/self-review-remediation-plan.md). The JavaScript ESM
CLI reads tracked files from the Git worktree and returns deterministic JSON.
Target-language interpreters and compilers are not required.

The CLI uses best-effort path checks. It is not a security sandbox for a
repository whose paths are being maliciously changed by another process while
analysis is running.

## Planned capabilities

- File counts, bytes, physical lines, blank lines, and nonblank lines.
- Basic text measurement for TXT, HTML, JSON, JSONL, Markdown, and YAML from
  the first milestone, plus readable text with other or missing extensions.
- Code/comment classification for JavaScript, TypeScript, Python, Java, and Shell.
- Breakdowns by language, extension, role, and category, including Agent
  instructions in Markdown and explicitly identified JSON/YAML definitions.
- Versioned result JSON with measurement coverage and structured diagnostics.
- Binary filenames, extensions, sizes, Git tracking, and ignore-rule information.

Text files contribute bytes, physical lines, blank lines, and nonblank lines.
Code/comment analysis adds detail for supported programming languages. JSONL
physical lines are counted without parsing records; HTML is measured as source
text, including embedded script/style lines once.

Run a basic report from the repository root:

```sh
node bundle/miku-repo-scale.mjs analyze . --detail summary
node bundle/miku-repo-scale.mjs analyze . --inventory all
```

The default inventory measures tracked files. `--inventory all` also lists
untracked and ignored files as metadata only; it does not read their contents.
Use `--include` and `--exclude` to select paths, `--config` for ordered
classification and encoding rules, and `--output` to create a new report file.

M1 reports file counts, bytes, physical lines, blank/nonblank lines, and
breakdowns by category, role, language, and extension. Readable text is counted
even when its extension is unknown or absent. Binary files retain filename,
extension, size, tracked state, and ignore-rule evidence. JSONL is measured as
source lines; HTML is measured once as its original text. The schemas are in
[`schemas/`](schemas/).

JavaScript, TypeScript, JSX, TSX, Python, Java, Bash, and common POSIX `sh`
syntax receive lexical code/comment line classification from pinned
Tree-sitter WebAssembly grammars. Java Unicode escapes follow JLS §3.3; Shell
CRLF comment ranges map back to the original source before physical-line
classification. Zsh and selected Bash-only constructs in `sh` files remain
unsupported. The standalone CLI and runtime bundles embed the parser and
grammar data. A parse failure keeps bytes and physical-line metrics, sets
code/comment metrics to `null`, and adds a `LEXICAL_ERROR` warning. Parser
choices, supported syntax, and dialect limits are in
[language support](docs/language-support.md). The ruleset identifier is now
`1.4.0`. M1 local acceptance passed under the documented filesystem scope;
the product OS/Node matrix and companion skill's hosted acceptance remain open.

## Build and release

Pushes, pull requests, and manual dispatch run the full test suite on Node.js
22, 24, and 26 across Ubuntu, macOS, and Windows through
[ci.yml](.github/workflows/ci.yml).

Use Node.js 22 or newer, npm, and `tar` for development:

```sh
npm ci
npm test
npm run check:artifacts
node bundle/miku-repo-scale.mjs --version
```

`npm test` builds both standalone bundles and the source archive before running
the analysis and packaging tests. The runtime bundle exports `analyze(options)`
and frozen `metadata` with `stage: "m1"` and `analysisAvailable: true`.

Push a tag `v<package-version>` (currently `v0.2.4`). The
[release workflow](.github/workflows/release-cli-runtime-bundles.yml) checks
out that exact tag, builds on Node.js 26, verifies the final assets on Node.js
22, and creates or updates its GitHub Release with:

- `miku-repo-scale-<tag-version>.mjs`
- `miku-repo-scale-runtime-<tag-version>.mjs`
- `miku-repo-scale-sources-<tag-version>.tgz`

A positive integer suffix is also accepted, such as `v0.2.4.1`. Asset filenames
use the full tag version; embedded product metadata retains package version
`0.2.4`. The workflow runs on `v*` tag pushes only. See
[development.md](docs/development.md) for local staging and verification.

## Project documents

- [Product design](docs/design.md)
- [Implementation plan: RSC-00–15](docs/implementation-plan.md)
- [Language support and parser selection](docs/language-support.md)
- [Current tasks](TODO.md)
- [Development and repository operations](docs/development.md)
- [Shared miku-soft references](docs/miku-soft-reference.md)
- [Sister projects and reference decisions](docs/reference-check.md)

The companion [miku-repo-scale-skills](https://github.com/igapyon/miku-repo-scale-skills)
will expose this CLI as the installable `igapyon-miku-repo-scale` Agent Skill.
The product core and result semantics belong to this repository.

## Runtime and repository rules

- Planned product minimum: Node.js 22; Git is required for tracked-file input.
- No npm runtime dependencies are needed by the distributed `.mjs` files.
  Parser packages are locked as development dependencies and embedded in the
  generated CLI/runtime bundles; esbuild is build tooling and Ajv is test
  tooling.
- `src/` owns product entrypoints; `tests/` owns packaging, measurement, and lexical-line checks.
- `workplace/` is local scratch space; only `workplace/.gitkeep` is tracked.
- Dependencies, build outputs, `.DS_Store`, and local `.codex/skills/` are ignored.
- Release artifacts will be generated from source and remain outside tracked files.

## License

[Apache-2.0](LICENSE).
