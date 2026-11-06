# Third-party notices

The project uses the Apache-2.0 license in [LICENSE](LICENSE).
The current M1 preview CLI/runtime bundles have no third-party production
runtime dependencies or upstream executable runtime artifacts.

Build tooling: [esbuild](https://github.com/evanw/esbuild), exact version 0.28.2,
MIT license. It is installed only for development/release builds. The source
archive records it in package.json/package-lock.json and does not redistribute
its executable or node_modules. Its license is available at
https://github.com/evanw/esbuild/blob/v0.28.2/LICENSE.md.

Test tooling: [Ajv](https://github.com/ajv-validator/ajv), exact version 8.20.0,
MIT license. It validates the published JSON Schemas in the test suite and is
not included in the standalone runtime bundles. Its license is available at
https://github.com/ajv-validator/ajv/blob/v8.20.0/LICENSE.

RSC-02 parser selection: the following exact development-only versions are
locked for the future M2 lexer bundle. All are MIT licensed. The runtime and
grammars are bundled into a single `.mjs`; they are not loaded from `node_modules`
at execution time. The language-specific upstreams and bundle measurement are
recorded in [language-support.md](docs/language-support.md).

- `@willbooster/web-tree-sitter` 17.0.1
- `@willbooster/tree-sitter-javascript` 22.0.1
- `@willbooster/tree-sitter-typescript` 26.0.1
- `@willbooster/tree-sitter-python` 16.0.0
- `@willbooster/tree-sitter-java` 32.0.1
- `@willbooster/tree-sitter-bash` 12.0.0
