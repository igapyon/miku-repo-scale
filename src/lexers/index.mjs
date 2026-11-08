import { Language, Parser } from "@willbooster/web-tree-sitter";
import { parserWasmAssets } from "./wasm-assets.mjs";
import { translateJavaUnicodeEscapes } from "./java-unicode.mjs";
import { normalizeShellSource } from "./shell-source.mjs";

const assets = parserWasmAssets();
await Parser.init({ wasmModule: await WebAssembly.compile(assets.runtime) });

const GRAMMARS = new Map([
  ["javascript", await Language.load(assets.javascript)],
  ["typescript", await Language.load(assets.typescript)],
  ["tsx", await Language.load(assets.tsx)],
  ["python", await Language.load(assets.python)],
  ["java", await Language.load(assets.java)],
  ["bash", await Language.load(assets.bash)],
]);

function grammarKey({ language, extension, dialect }) {
  if (language === "javascript") return "javascript";
  if (language === "typescript") return extension.toLowerCase() === ".tsx" ? "tsx" : "typescript";
  if (language === "python") return "python";
  if (language === "java") return "java";
  if (language === "shell" && ["bash", "sh"].includes(dialect)) return "bash";
  return null;
}

const COMMENT_NODE_TYPES = ["comment", "line_comment", "block_comment"];
const BASH_ONLY_SYNTAX_IN_SH = new Set([
  "arithmetic_command",
  "ansi_c_string",
  "array",
  "c_style_for_statement",
  "coproc_command",
  "herestring_redirect",
  "process_substitution",
  "test_command",
]);
const BASH_ONLY_NODE_TYPES = [...BASH_ONLY_SYNTAX_IN_SH, "function_definition"];

function hasBashOnlySyntaxInSh(tree) {
  return tree.rootNode.descendantsOfType(BASH_ONLY_NODE_TYPES).some((node) =>
    BASH_ONLY_SYNTAX_IN_SH.has(node.type) || /^[\t ]*function[\t ]+/u.test(node.text));
}

/** Parse a source file and return UTF-16 half-open comment ranges or a clear failure state. */
export function lexSource({ language, extension = "", dialect = null, text }) {
  const key = grammarKey({ language, extension, dialect });
  if (!key) return { status: "unsupported", reason: language === "shell" ? "dialect" : "language" };

  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(GRAMMARS.get(key));
    let parseText = text;
    let mapRange = (start, end) => ({ start, end });
    if (language === "java") {
      const translated = translateJavaUnicodeEscapes(text);
      if (translated.status !== "available") return { status: "error", reason: translated.reason };
      parseText = translated.text;
      mapRange = translated.mapRange;
    } else if (language === "shell") {
      const normalized = normalizeShellSource(text);
      parseText = normalized.text;
      mapRange = normalized.mapRange;
    }
    tree = parser.parse(parseText);
    if (tree.rootNode.hasError) return { status: "error", reason: "syntax" };
    if (language === "shell" && dialect === "sh" && hasBashOnlySyntaxInSh(tree)) {
      return { status: "unsupported", reason: "dialect_syntax" };
    }
    const commentRanges = [];
    for (const node of tree.rootNode.descendantsOfType(COMMENT_NODE_TYPES)) {
      const range = mapRange(node.startIndex, node.endIndex);
      if (!range) return { status: "error", reason: "source_mapping" };
      commentRanges.push(range);
    }
    return { status: "available", comment_ranges: commentRanges };
  } catch {
    return { status: "error", reason: "parser_failure" };
  } finally {
    tree?.delete();
    parser.delete();
  }
}
