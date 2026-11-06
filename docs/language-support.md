---
title: miku-repo-scale lexer support and parser selection
status: implementation-in-progress
updated: 2026-11-06
---

# Lexer support and parser selection

## RSC-02 decision

**Decision (2026-11-06):** use the WebAssembly build of the Tree-sitter parser
family for JavaScript, TypeScript/TSX, Python, Java, and Bash. The RSC-09
JavaScript and TypeScript integrations now connect source ranges to the product
result. The standalone CLI/runtime `.mjs` bundles embed the parser runtime and
grammar WASM; direct source execution loads the same pinned package assets.
Python, Java, and Bash still need their language-specific integrations.

The parser family was selected over five hand-maintained lexical scanners
because it already distinguishes comments from strings, templates, expressions,
and heredoc bodies, and reports parse errors. A proof bundle produced with
esbuild 0.28.2 and the pinned packages below was **6,422,960 bytes** after
minification. That prototype embeds the runtime and all selected grammar data
as base64 data URLs and runs without the source checkout or `node_modules`.
It is a parser-only measurement; the final M2 application bundle will include
the product code too.

`@babel/parser` 8.1.0 was also considered for JavaScript/TypeScript: its official
API documents JSX, TypeScript, comment nodes with source positions, and syntax
errors. It is a good language-specific option, but choosing it would require a
separate parser family for the remaining languages. The Tree-sitter WASM
prototype gave one source-range and error contract across all five language
groups. The official Web binding documents loading grammar WASM and node source
indices; the pinned WillBooster runtime and grammars were exercised directly.

## Pinned parser packages

These exact versions are locked as development dependencies. Each package is
MIT licensed. The grammar packages are published by WillBooster and identify
their corresponding upstream grammar in their repository documentation.
Tree-sitter's WebAssembly runtime and language grammars are embedded when the
standalone CLI/runtime bundles are built, so users do not install npm packages.

| Package | Version | npm unpacked bytes | Source |
| --- | ---: | ---: | --- |
| `@willbooster/web-tree-sitter` | `17.0.1` | 5,444,937 | [WillBooster Tree-sitter runtime](https://github.com/WillBooster/tree-sitter) |
| `@willbooster/tree-sitter-javascript` | `22.0.1` | 949,348 | [JavaScript grammar](https://github.com/WillBooster/tree-sitter-javascript), based on [tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript) |
| `@willbooster/tree-sitter-typescript` | `26.0.1` | 3,456,452 | [TypeScript and TSX grammars](https://github.com/WillBooster/tree-sitter-typescript), based on [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript) |
| `@willbooster/tree-sitter-python` | `16.0.0` | 394,652 | [Python grammar](https://github.com/WillBooster/tree-sitter-python), based on tree-sitter-python 0.25.0 |
| `@willbooster/tree-sitter-java` | `32.0.1` | 565,911 | [Java grammar](https://github.com/WillBooster/tree-sitter-java), based on [tree-sitter-java](https://github.com/tree-sitter/tree-sitter-java) 0.23.5 |
| `@willbooster/tree-sitter-bash` | `12.0.0` | 602,114 | [Bash grammar](https://github.com/WillBooster/tree-sitter-bash), based on [tree-sitter-bash](https://github.com/tree-sitter/tree-sitter-bash) |

The grammar packages use Tree-sitter ABI `0x5742000c`; the runtime is pinned
to the compatible `17.0.1` release. Do not independently upgrade the runtime
or one grammar without rerunning the lexer fixtures and isolated bundle smoke.

The proof bundle contained these `.wasm` payloads: runtime 248,003 bytes;
JavaScript 374,275; TypeScript 1,472,693; TSX 1,524,418; Python 279,006; Java
369,648; Bash 488,887. The JavaScript package and the TypeScript package supply
separate JavaScript, TypeScript, and TSX grammars. esbuild's `.wasm=dataurl`
loader embeds those bytes in the single `.mjs`.

## Language and dialect scope

| Inputs | Grammar and mode | Initial supported scope | Explicit limit |
| --- | --- | --- | --- |
| `.js`, `.mjs`, `.cjs`, `.jsx` | JavaScript grammar | Modern JavaScript, JSX, regex literals, nested templates and embedded expressions | No Flow or project-specific syntax plugins are enabled |
| `.ts`, `.mts`, `.cts`, `.d.ts` | TypeScript grammar | Type declarations and TypeScript expression syntax | No type checking or TypeScript compiler execution |
| `.tsx` | TSX grammar | TypeScript with JSX, including type arguments and JSX expressions | Kept distinct from `.ts` because `<T>` has different syntax |
| `.py` | Python grammar | Python 3 grammar represented by the pinned grammar, including PEP 701 f-string expressions | Python source is parsed only; it is never executed |
| `.java` | Java grammar | Grammar-supported Java including records and text blocks | Java Unicode escapes must be translated before parsing; no type checking or compiler execution |
| `.bash`, Bash shebang | Bash grammar | Bash syntax, command substitution, heredoc delimiters and bodies | Parser errors or missing nodes make lexical metrics unavailable |
| `.sh`, `sh` shebang | Bash grammar for common POSIX-compatible input | Common POSIX shell syntax accepted by the pinned Bash grammar | This does not certify full POSIX `sh` conformance; Bash-only constructs in `sh` files must be diagnosed |
| `.zsh`, Zsh shebang or explicit Zsh dialect | None | Basic text metrics and shell classification remain available | Comment/code analysis is `unsupported` until a Zsh grammar is selected and verified |

**Current integration (RSC-09):** JavaScript (`.js`, `.mjs`, `.cjs`, `.jsx`),
TypeScript (`.ts`, `.mts`, `.cts`, `.d.ts`), and TSX (`.tsx`) are connected to
the result API. Fixtures confirm regex and JSX text are not mistaken for
comments, while template/JSX expression comments retain UTF-16 source ranges.
Shebangs count as code. Python, Java, and Shell are selected but still return
`comment_analysis: unsupported` until RSC-10 through RSC-12.

Language, extension, explicit configuration, basename, and shebang continue to
be resolved by the existing ordered classification rules. A parser failure,
missing syntax node, Java translation failure, or unsupported dialect leaves
the file's code/comment metrics `null` and adds a stable diagnostic. It must
not silently count a partial parse as a complete result.

## Source positions and preprocessing

The shared range unit is **UTF-16 code units**, matching Node.js string
indices and `src/physical-lines.mjs`. The pinned WebAssembly runtime returned
index 3 for a comment following `😀 `, which is the expected UTF-16 offset.
RSC-08 validates ranges against the original text, then maps covered
characters onto original physical lines. The runtime uses those ranges for
JavaScript and TypeScript; Java preprocessing still needs its own source map.

Java needs one language-specific preprocessing step. The Java Language
Specification requires Unicode escapes to be translated before tokenization;
an escape can introduce `/`, `*`, or a line terminator and therefore create or
end a comment. RSC-11 must implement the JLS backslash-eligibility rules, keep a
translated-offset-to-original-offset map, and map parser comments back before
physical-line classification. The RSC-02 experiment covered simple escapes
that create a block comment, a line comment, and a line terminator; it did not
implement the full JLS eligibility algorithm.

## Reproduction fixtures and observations

The hand-authored cases are in
[`tests/fixtures/lexers/`](../tests/fixtures/lexers/), with expectations in
[`manifest.json`](../tests/fixtures/lexers/manifest.json). The pinned WASM
grammars produced no error nodes for each valid fixture. They detected the
corresponding intentionally malformed JavaScript, TSX, Python, Java, and Bash
snippets through `rootNode.hasError`.

| Fixture | Observation | Comment ranges in original UTF-16 source |
| --- | --- | --- |
| `javascript-tsx.tsx` | Regex slashes and JSX attribute text are not comments; template-expression comments are | `51..77`, `154..187` |
| `python-pep701.py` | Same-quote string access and a multiline PEP 701 expression comment parse | `46..71` |
| `java-text-block.java` | Comment markers inside a valid text block are not comments | `148..170` |
| `java-unicode-escapes.java` | Translation creates block/line comments; source-map restoration expands the two spans | `32..82`, `100..137` |
| `shell-heredoc.bash` | Heredoc text and `${HOME#prefix}` are not comments; the command-substitution and trailing comments are | `89..119`, `126..148` |

The one-file parser prototype was built and executed on Node.js 26.12.1 and
Node.js 22.23.4. Each of the six grammars (JavaScript, TypeScript, TSX, Python,
Java, Bash) parsed its valid smoke input with `hasError === false`. The parser
prototype was 6,422,960 bytes before application code was added. The integrated
JavaScript/TypeScript CLI bundle is 6,507,990 bytes and the runtime bundle is
6,502,819 bytes. On Node.js 22.23.4, the focused parser tests and isolated
CLI/runtime/source artifact checks pass. Startup time, large-file memory use,
and the broader OS matrix are still unmeasured.

## Primary references

- [Babel parser API](https://babeljs.io/docs/babel-parser)
- [Tree-sitter Web binding and node indices](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md)
- [Python PEP 701](https://peps.python.org/pep-0701/) and [Python lexical analysis](https://docs.python.org/3/reference/lexical_analysis.html)
- [Java Language Specification §3.3, Unicode escapes](https://docs.oracle.com/javase/specs/jls/se26/html/jls-3.html#jls-3.3)
- [Tree-sitter Bash grammar](https://github.com/tree-sitter/tree-sitter-bash)
