import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyze } from "../src/runtime.mjs";
import { lexSource } from "../src/lexers/index.mjs";

const fixtureRoot = new URL("./fixtures/lexers/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, fixtureRoot), "utf8");

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "miku-repo-scale lexical parser-"));
  mkdirSync(join(root, "src"));
  execFileSync("git", ["-C", root, "init", "-q"]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, path, text) {
  const destination = join(root, path);
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(destination, text);
}

function track(root) {
  execFileSync("git", ["-C", root, "add", "--all"]);
}

test("JavaScript and TypeScript grammar modes expose original UTF-16 comment ranges", () => {
  const source = fixture("javascript-tsx.tsx");
  const result = lexSource({ language: "typescript", extension: ".tsx", text: source });
  assert.equal(result.status, "available");
  assert.deepEqual(result.comment_ranges.map(({ start, end }) => [start, end]), [[51, 77], [154, 187]]);

  for (const [language, extension, text] of [
    ["javascript", ".js", 'const value = "/* string */"; // comment\n'],
    ["javascript", ".mjs", "const value = /https?:\\/\\//; /* comment */\n"],
    ["javascript", ".cjs", "const value = `text ${1 /* comment */}`;\n"],
    ["javascript", ".jsx", 'const view = <p title="/* text */">{value /* comment */}</p>;\n'],
    ["typescript", ".ts", "interface Shape { value: string } // comment\n"],
    ["typescript", ".mts", "const value: string = `text ${1 /* comment */}`;\n"],
    ["typescript", ".cts", "type Shape = { value: number }; // comment\n"],
    ["typescript", ".d.ts", "declare const value: string; // comment\n"],
    ["typescript", ".tsx", "const view = <T,>(value: T) => <p>{value /* comment */}</p>;\n"],
  ]) {
    const parsed = lexSource({ language, extension, text });
    assert.equal(parsed.status, "available", `${language}${extension}`);
    assert.ok(parsed.comment_ranges.length > 0, `${language}${extension}`);
  }
});

test("analysis applies JavaScript and TypeScript comment metrics, with clean fallback states", (t) => {
  const root = repository(t);
  write(root, "src/main.mjs", "#!/usr/bin/env node\n// comment only\nconst value = /https?:\\/\\//; /* inline */\n");
  write(root, "src/view.tsx", fixture("javascript-tsx.tsx"));
  write(root, "src/types.d.ts", "declare const value: string; // declaration\n");
  write(root, "src/broken.js", "const broken = ;\n");
  write(root, "src/utility.py", "print('python')\n");
  write(root, "data.json", "{\"value\": true}\n");
  track(root);

  const result = analyze({ root });
  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(result.status, "ok");

  assert.equal(files.get("src/main.mjs").measurement, "lexical");
  assert.equal(files.get("src/main.mjs").comment_analysis, "available");
  assert.deepEqual({
    total: files.get("src/main.mjs").metrics.total_physical_lines,
    blank: files.get("src/main.mjs").metrics.blank_lines,
    comment: files.get("src/main.mjs").metrics.comment_only_lines,
    code: files.get("src/main.mjs").metrics.code_lines,
    mixed: files.get("src/main.mjs").metrics.mixed_code_comment_lines,
    withComments: files.get("src/main.mjs").metrics.lines_with_comments,
  }, { total: 3, blank: 0, comment: 1, code: 2, mixed: 1, withComments: 2 });
  assert.equal(files.get("src/view.tsx").measurement, "lexical");
  assert.equal(files.get("src/types.d.ts").measurement, "lexical");
  assert.equal(result.summary.coverage.lexically_classified_files, 3);
  assert.equal(result.summary.totals.classified_lines.files, 3);
  assert.equal(result.by_language.typescript.classified_lines.files, 2);

  assert.equal(files.get("src/broken.js").measurement, "basic");
  assert.equal(files.get("src/broken.js").comment_analysis, "error");
  assert.equal(files.get("src/broken.js").metrics.total_physical_lines, 1);
  assert.equal(files.get("src/broken.js").metrics.code_lines, null);
  assert.equal(files.get("src/utility.py").measurement, "basic");
  assert.equal(files.get("src/utility.py").comment_analysis, "unsupported");
  assert.equal(files.get("data.json").comment_analysis, "not_requested");
  assert.deepEqual(result.diagnostics.map(({ code, path, severity }) => [code, severity, path]), [
    ["LEXICAL_ERROR", "warning", "src/broken.js"],
    ["COMMENT_ANALYSIS_UNSUPPORTED", "warning", "src/utility.py"],
  ]);
});
