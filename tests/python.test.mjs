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
  const root = mkdtempSync(join(tmpdir(), "miku-repo-scale python lexer-"));
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

test("Python parser recognizes PEP 701 comments and maps the fixture range", () => {
  const text = fixture("python-pep701.py");
  const result = lexSource({ language: "python", extension: ".py", text });
  assert.equal(result.status, "available");
  assert.deepEqual(result.comment_ranges.map(({ start, end }) => [start, end]), [[46, 71]]);
});

test("Python strings, docstrings, raw/bytes literals, and f-string comments classify by physical line", (t) => {
  const root = repository(t);
  const source = [
    "#!/usr/bin/env python3",
    '"""module docstring',
    "# string content, not a comment",
    '"""',
    'raw = r"# raw string"',
    'binary = b"# bytes"',
    'formatted = f"{value # inline f-string comment',
    '}"',
    "value = 1 # type: ignore",
    "",
    "",
  ].join("\r\n");
  write(root, "src/strings.py", source);
  write(root, "src/pep701.py", fixture("python-pep701.py"));
  write(root, "src/script", "#!/usr/bin/env python3\r\nprint('# string')\r\n");
  write(root, "src/broken.py", 'value = f"{1 + }"\r\n');
  write(root, "data.json", '{"value":true}\n');
  execFileSync("git", ["-C", root, "add", "--all"]);

  const result = analyze({ root });
  const files = new Map(result.files.map((file) => [file.path, file]));
  const measured = files.get("src/strings.py");
  assert.equal(result.status, "ok");
  assert.equal(measured.language, "python");
  assert.equal(measured.measurement, "lexical");
  assert.equal(measured.comment_analysis, "available");
  assert.deepEqual({
    total: measured.metrics.total_physical_lines,
    blank: measured.metrics.blank_lines,
    nonblank: measured.metrics.nonblank_lines,
    comment: measured.metrics.comment_only_lines,
    code: measured.metrics.code_lines,
    mixed: measured.metrics.mixed_code_comment_lines,
    withComments: measured.metrics.lines_with_comments,
  }, { total: 10, blank: 1, nonblank: 9, comment: 0, code: 9, mixed: 2, withComments: 2 });

  assert.equal(files.get("src/pep701.py").measurement, "lexical");
  assert.equal(files.get("src/pep701.py").metrics.mixed_code_comment_lines, 1);
  assert.equal(files.get("src/script").language_reason, "shebang:python3");
  assert.equal(files.get("src/script").measurement, "lexical");
  assert.equal(files.get("src/script").metrics.comment_only_lines, 0);
  assert.equal(files.get("src/script").metrics.code_lines, 2);

  assert.equal(files.get("src/broken.py").measurement, "basic");
  assert.equal(files.get("src/broken.py").comment_analysis, "error");
  assert.equal(files.get("src/broken.py").metrics.total_physical_lines, 1);
  assert.equal(files.get("src/broken.py").metrics.code_lines, null);
  assert.equal(files.get("data.json").comment_analysis, "not_requested");
  assert.deepEqual(result.diagnostics.map(({ code, severity, path }) => [code, severity, path]), [
    ["LEXICAL_ERROR", "warning", "src/broken.py"],
  ]);
  assert.equal(result.summary.coverage.lexically_classified_files, 3);
  assert.equal(result.summary.totals.classified_lines.files, 3);
  assert.equal(result.by_language.python.classified_lines.files, 3);
});
