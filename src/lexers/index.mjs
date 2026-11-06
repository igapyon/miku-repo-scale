import { Language, Parser } from "@willbooster/web-tree-sitter";
import { parserWasmAssets } from "./wasm-assets.mjs";

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
  if (language === "shell" && dialect === "zsh") return null;
  // Python, Java, and Bash are connected in RSC-10 through RSC-12.
  return null;
}

const COMMENT_NODE_TYPES = ["comment", "line_comment", "block_comment"];

/** Parse a source file and return UTF-16 half-open comment ranges or a clear failure state. */
export function lexSource({ language, extension = "", dialect = null, text }) {
  const key = grammarKey({ language, extension, dialect });
  if (!key) return { status: "unsupported", reason: language === "shell" && dialect === "zsh" ? "dialect" : "language" };

  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(GRAMMARS.get(key));
    tree = parser.parse(text);
    if (tree.rootNode.hasError) return { status: "error", reason: "syntax" };
    const commentRanges = tree.rootNode.descendantsOfType(COMMENT_NODE_TYPES).map((node) => ({
      start: node.startIndex,
      end: node.endIndex,
    }));
    return { status: "available", comment_ranges: commentRanges };
  } catch {
    return { status: "error", reason: "parser_failure" };
  } finally {
    tree?.delete();
    parser.delete();
  }
}
