# Reference check and scaffold decisions

Checked: 2026-11-05. Deliverable: APP initial scaffold, not a runnable product.

## Shared references

- Installed `igapyon-miku-soft-developer` and its matching layer workflow.
- Installed `igapyon-repo-conventions` repository rules.
- Shared-source checkout HEAD: `493afba15c19ed7e3fc0c6868b4133cb2d929453`.
- Installed files are pinned below by digest; the checkout HEAD is context,
  not proof that the installed copies share the exact source revision.

- `igapyon-miku-soft-developer/SKILL.md`: `158fb40c08d427aa79d9e4589b7bf8077914d5b5acada94c5dfde1adb9cda0e0`
- `igapyon-miku-soft-developer/references/10-node-app-workflow.md`: `316ca2100ae04245645057bec484c696aac99952bd16a858d6dc300a3023fe2c`
- `igapyon-miku-soft-developer/references/40-agent-skills-workflow.md`: `cc65def976fea0e5d66f8b318aedafb217c42b4b17148484c990ed873a177cab`
- `igapyon-repo-conventions/references/repository-rules.md`: `a03635189a83e892f303b1f1baf8342160aec5b3b2185eda8dbfbb8bd5652f12`

## Sister examples inspected before scaffolding

| Local checkout | Inspected HEAD | Adopted shape |
| --- | --- | --- |
| `/Users/igapyon/Documents/git/miku-indexgen` | `daf1e2b07f41e63a7e641ce18a6cdebfd3ec75d9` | small Node CLI, product-owned contracts, source/runtime separation |
| `/Users/igapyon/Documents/git/miku-indexgen-skills` | `cc6578a2aea71aea71955398231e249a96561e29` | installed `igapyon-` identity, skill-local runtime/lib, build bundle commands |
| `/Users/igapyon/Documents/git/miku-grep-skills` | `1adf7b735d8d50321ac65fc9e99d1377282d46a5` | thin CLI-backed skill, explicit product workflow, compact references |

These references already exist beside the target checkouts; no extra copies
were placed under workplace. No same-layer reference exists under the initially
empty target workplace. Sister source trees and older compatibility baselines
were not copied. Node-only scope follows the user: no Java companion/backend.

The main app stays JavaScript ESM rather than adopting the sister's TypeScript
toolchain. Its source/build/test entrypoints and M1 measurement core are in
place. The skill uses
the shared starter's packaging skeleton, which rejects missing declared runtime.
The initial upstream filename is a receipt target, not verified runtime identity.

## Baseline verification

The [official Node.js schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
was checked: the project floor remains 22; newest LTS at the check date is 26.
Plan Node 22/24/26 verification and Node 26 release builds. Local environment:
Node v26.12.1, npm 11.20.0, Git 2.54.0. Lower Node lines have not been executed.

Workflow preparation uses the current official
[checkout v7](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node v7](https://github.com/actions/setup-node/releases/tag/v7.1.0), and
[action-gh-release v3](https://github.com/softprops/action-gh-release/releases/tag/v3.0.3)
lines. Hosted workflows have not been run.

At initial implementation, the operational `10-node-app-workflow.md` used
`release: published`, while the basic main-app design showed tag push. The
requested product behavior is tag push; the active workflow now uses
`push.tags: ["v*"]` and does not also run on Release published.
Product path ordering retains the explicitly documented UTF-8 byte contract in
the product design; the shared UTF-16 preference is not silently substituted.

## Verification record

Initial verification covers metadata and local links, script syntax, and the
missing-runtime build rejection. It predates the M1 implementation. Current M1
tests and artifact execution are recorded in development.md. Node 22 and 26
have passed locally; Node 24 execution and hosted CI remain pending.

## Release infrastructure maintenance (2026-11-06)

Profile: Node main application, Release assets. Used the installed
`igapyon-miku-soft-developer` maintenance workflow, `10-node-app-workflow.md`,
repository operations, and the repository-conventions baseline.
The installed SKILL and Node workflow digests remain the values recorded above.
Shared-source checkout HEAD at this inspection:
`c715d69d55d823c5ecf2b25a24d045b322085c33` (context, not an installed-file revision claim).

Same-layer local references:

- `miku-indexgen`, HEAD `daf1e2b07f41e63a7e641ce18a6cdebfd3ec75d9`:
  esbuild ESM bundling, separate build helper, isolated CLI smoke, and curated sources.
- `miku-text-bundle`, HEAD `58cef5fcb190b10995a633ec60434013c901932b`:
  package-script orchestration and Release asset naming/staging.

Their older Action versions, product Node minimums, tag/manual triggers, and
single-CLI-only artifact shapes were evaluated against the current owning
workflow. This project now uses a `v*` tag-push trigger and exact tag checkout,
CLI/runtime/source assets, a Node 26 build host, and final staged-byte checks
on Node 22. The M1 runtime exports the analysis API and metadata; language-aware
code/comment classification remains planned.

Current primary references checked:

- [Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json):
  Node 26 entered LTS on 2026-10-28; Node 22 remains maintained.
- [setup-node](https://github.com/actions/setup-node): checkout/setup-node v7 examples.
- [action-gh-release](https://github.com/softprops/action-gh-release): v3 and prepared asset upload.
- [esbuild API](https://esbuild.github.io/api/): ESM bundling with a Node target.
  npm registry metadata confirmed esbuild 0.28.2, MIT; adopted as a pinned build-only dependency.
- [git-check-ignore](https://git-scm.com/docs/git-check-ignore): tracked-path evaluation
  via `--no-index`, verbose rule evidence, negation, and NUL-delimited records.

Adjacent approved maintenance adopted: clean staging, an exact final-file set,
minimum-runtime verification, and least-authority workflow permissions. The
later self-review correction changes the trigger to tag push. Local actionlint,
Node 24 execution, and hosted OS/Node acceptance remain pending; the run record
is in development.md.
