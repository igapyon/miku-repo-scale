import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PACKAGE_ASSETS = Object.freeze({
  runtime: "@willbooster/web-tree-sitter/web-tree-sitter.wasm",
  javascript: "@willbooster/tree-sitter-javascript/tree-sitter-javascript.wasm",
  typescript: "@willbooster/tree-sitter-typescript/tree-sitter-typescript.wasm",
  tsx: "@willbooster/tree-sitter-typescript/tree-sitter-tsx.wasm",
  python: "@willbooster/tree-sitter-python/tree-sitter-python.wasm",
  java: "@willbooster/tree-sitter-java/tree-sitter-java.wasm",
  bash: "@willbooster/tree-sitter-bash/tree-sitter-bash.wasm",
});

/** Read pinned parser payloads for direct source execution; builds inline these bytes. */
export function parserWasmAssets() {
  return Object.fromEntries(Object.entries(PACKAGE_ASSETS).map(([name, specifier]) => [
    name,
    readFileSync(fileURLToPath(import.meta.resolve(specifier))),
  ]));
}
