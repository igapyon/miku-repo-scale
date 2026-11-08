import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyze } from "../src/runtime.mjs";
import { lexSource } from "../src/lexers/index.mjs";
import { translateJavaUnicodeEscapes } from "../src/lexers/java-unicode.mjs";

const fixtureRoot = new URL("./fixtures/lexers/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, fixtureRoot), "utf8");

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "miku-repo-scale java lexer-"));
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

test("Java Unicode escape translation follows JLS eligibility and maps UTF-16 ranges", () => {
  const raw = String.raw`😀 \u002f\u002f comment\u000a int value = 1;`;
  const translated = translateJavaUnicodeEscapes(raw);
  assert.equal(translated.status, "available");
  assert.equal(translated.text, "😀 // comment\n int value = 1;");
  const commentStart = translated.text.indexOf("//");
  const commentEnd = translated.text.indexOf("\n");
  assert.deepEqual(translated.mapRange(commentStart, commentEnd), {
    start: raw.indexOf("\\u002f"),
    end: raw.indexOf("\\u000a"),
  });

  assert.equal(translateJavaUnicodeEscapes(String.raw`\\u002f`).text, String.raw`\\u002f`);
  assert.equal(translateJavaUnicodeEscapes(String.raw`\\u00G0`).status, "available", "an ineligible malformed escape is left raw");
  assert.equal(translateJavaUnicodeEscapes(String.raw`\uuuu002f`).text, "/");
  assert.equal(translateJavaUnicodeEscapes(String.raw`\u005cu005a`).text, String.raw`\u005a`);
  assert.equal(translateJavaUnicodeEscapes(String.raw`\u005c\u005c\u006e`).text, String.raw`\\n`);
  assert.deepEqual(translateJavaUnicodeEscapes(String.raw`\u00G0`), { status: "error", reason: "unicode_escape" });
});

test("Java lexer maps Unicode-created comments and excludes comment markers in literals", () => {
  const unicode = lexSource({ language: "java", extension: ".java", text: fixture("java-unicode-escapes.java") });
  assert.equal(unicode.status, "available");
  assert.deepEqual(unicode.comment_ranges.map(({ start, end }) => [start, end]), [[32, 82], [100, 137]]);

  const textBlock = lexSource({ language: "java", extension: ".java", text: fixture("java-text-block.java") });
  assert.equal(textBlock.status, "available");
  assert.deepEqual(textBlock.comment_ranges.map(({ start, end }) => [start, end]), [[148, 170]]);

  const literalSource = "class Literals { String value = \"/* string */ // text\"; char quote = '\\''; char newline = '\\n'; // source comment\n}";
  const literals = lexSource({
    language: "java",
    extension: ".java",
    text: literalSource,
  });
  assert.equal(literals.status, "available");
  assert.equal(literals.comment_ranges.length, 1);
  const [{ start, end }] = literals.comment_ranges;
  assert.equal(literalSource.slice(start, end), "// source comment");
});

test("Java analysis uses original physical lines and falls back on invalid input", (t) => {
  const root = repository(t);
  const escapedLine = `class JavaLines {\r\n  \\u002f\\u002f comment\\u000a int value = 1;\r\n}\r\n`;
  write(root, "src/UnicodeEscapeComments.java", fixture("java-unicode-escapes.java"));
  write(root, "src/JavaLines.java", escapedLine);
  write(root, "src/TextBlockComments.java", fixture("java-text-block.java"));
  write(root, "src/Broken.java", 'class Broken { String text = "unterminated; }\n');
  write(root, "src/InvalidEscape.java", String.raw`class InvalidEscape { \u00G0 }`);
  execFileSync("git", ["-C", root, "add", "--all"]);

  const result = analyze({ root });
  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(result.status, "ok");

  const unicode = files.get("src/UnicodeEscapeComments.java");
  assert.equal(unicode.measurement, "lexical");
  assert.equal(unicode.metrics.total_physical_lines, 4);
  assert.equal(unicode.metrics.comment_only_lines, 0);
  assert.equal(unicode.metrics.mixed_code_comment_lines, 2);
  assert.equal(unicode.metrics.lines_with_comments, 2);

  const escaped = files.get("src/JavaLines.java");
  assert.equal(escaped.measurement, "lexical");
  assert.equal(escaped.metrics.total_physical_lines, 3, "escaped line terminators do not add raw physical lines");
  assert.equal(escaped.metrics.mixed_code_comment_lines, 1);
  assert.equal(escaped.metrics.lines_with_comments, 1);
  assert.equal(files.get("src/TextBlockComments.java").measurement, "lexical");

  for (const path of ["src/Broken.java", "src/InvalidEscape.java"]) {
    const file = files.get(path);
    assert.equal(file.measurement, "basic");
    assert.equal(file.comment_analysis, "error");
    assert.equal(file.metrics.total_physical_lines, 1);
    assert.equal(file.metrics.code_lines, null);
  }
  assert.deepEqual(result.diagnostics.map(({ code, severity, path }) => [code, severity, path]), [
    ["LEXICAL_ERROR", "warning", "src/Broken.java"],
    ["LEXICAL_ERROR", "warning", "src/InvalidEscape.java"],
  ]);
  assert.equal(result.summary.coverage.lexically_classified_files, 3);
  assert.equal(result.by_language.java.classified_lines.files, 3);
});
