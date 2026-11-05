# miku-repo-scale

Measure the size and composition of a Git repository: program code, Agent
instructions, declarative definitions, tests, documentation, and generated files.

**Status: initial project scaffold. The CLI and analysis core are not implemented.**
The first implementation is JavaScript ESM on Node.js, with Git used to enumerate
tracked files. Target-language interpreters and compilers are not required.

## Planned capabilities

- File counts, bytes, physical lines, blank lines, and nonblank lines.
- Basic measurement for Markdown, JSON, and YAML from the first milestone.
- Code/comment classification for JavaScript, TypeScript, Python, Java, and Shell.
- Breakdowns by language, extension, role, and category, including Agent
  instructions in Markdown and explicitly identified JSON/YAML definitions.
- Versioned result JSON with measurement coverage and structured diagnostics.

The proposed CLI is `miku-repo-scale analyze <repository-root>`. This is a
planned interface; no `bin` or package export is declared until its entrypoint exists.

## Project documents

- [Product design](docs/design.md)
- [Implementation plan: RSC-00–15](docs/implementation-plan.md)
- [Current tasks](TODO.md)
- [Development and repository operations](docs/development.md)
- [Shared miku-soft references](docs/miku-soft-reference.md)
- [Sister projects and reference decisions](docs/reference-check.md)

The companion [miku-repo-scale-skills](https://github.com/igapyon/miku-repo-scale-skills)
will expose this CLI as the installable `igapyon-miku-repo-scale` Agent Skill.
The product core and result semantics belong to this repository.

## Runtime and repository rules

- Planned product minimum: Node.js 22; Git is required for tracked-file input.
- Current scaffold has no npm dependencies, executable product, build, or test commands.
- `src/` will own product code; `tests/` will own verification fixtures and tests.
- `workplace/` is local scratch space; only `workplace/.gitkeep` is tracked.
- Dependencies, build outputs, `.DS_Store`, and local `.codex/skills/` are ignored.
- Release artifacts will be generated from source and remain outside tracked files.

## License

[Apache-2.0](LICENSE).
