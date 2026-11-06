import assert from "node:assert/strict";
import test from "node:test";
import { aggregateResults } from "../src/analyze.mjs";
import { CATEGORIES, ROLES } from "../src/classification.mjs";
import { assertResultInvariants, emptyAggregate, SCHEMA_VERSION } from "../src/contracts.mjs";
import { classifyLexicalLines } from "../src/lexical-lines.mjs";
import { countPhysicalLines } from "../src/physical-lines.mjs";

const source = "\r\n  const a = 1; // inline\r\n/* first\n\n * inside\n */\n\t\n";
const sourceComments = [
  { start: source.indexOf("// inline"), end: source.indexOf("// inline") + "// inline".length },
  { start: source.indexOf("/* first"), end: source.indexOf(" */") + " */".length },
];

const expectedSourceLines = {
  total_physical_lines: 7,
  blank_lines: 3,
  nonblank_lines: 4,
  comment_only_lines: 3,
  code_lines: 1,
  mixed_code_comment_lines: 1,
  lines_with_comments: 4,
};

function aggregateFor(metrics, files, bytes) {
  return {
    files,
    bytes,
    total_physical_lines: metrics.total_physical_lines,
    blank_lines: metrics.blank_lines,
    nonblank_lines: metrics.nonblank_lines,
    classified_lines: { files, bytes, ...metrics },
  };
}

test("classifies comment-only, code, mixed, and physically blank lines", () => {
  const metrics = classifyLexicalLines(source, sourceComments);
  assert.deepEqual(metrics, expectedSourceLines);
  assert.equal(metrics.total_physical_lines, metrics.blank_lines + metrics.comment_only_lines + metrics.code_lines);
  assert.equal(metrics.nonblank_lines, metrics.comment_only_lines + metrics.code_lines);
  assert.equal(metrics.lines_with_comments, metrics.comment_only_lines + metrics.mixed_code_comment_lines);
  assert.ok(metrics.mixed_code_comment_lines <= metrics.code_lines);
});

test("uses UTF-16 offsets, sorts ranges, and gives blank physical lines priority", () => {
  const text = "😀 const x = 1; /* inline */\r\n   \n// only\n";
  const comment = text.indexOf("/* inline */");
  const lineComment = text.indexOf("// only");
  assert.deepEqual(classifyLexicalLines(text, [
    { start: lineComment, end: lineComment + "// only".length },
    { start: comment, end: comment + "/* inline */".length },
  ]), {
    total_physical_lines: 3,
    blank_lines: 1,
    nonblank_lines: 2,
    comment_only_lines: 1,
    code_lines: 1,
    mixed_code_comment_lines: 1,
    lines_with_comments: 2,
  });
});

test("returns zero metrics for empty input and basic metrics without comments", () => {
  assert.deepEqual(classifyLexicalLines("", []), {
    total_physical_lines: 0, blank_lines: 0, nonblank_lines: 0,
    comment_only_lines: 0, code_lines: 0, mixed_code_comment_lines: 0, lines_with_comments: 0,
  });
  assert.deepEqual(classifyLexicalLines("\r\n   \ntext\n", []), {
    total_physical_lines: 3, blank_lines: 2, nonblank_lines: 1,
    comment_only_lines: 0, code_lines: 1, mixed_code_comment_lines: 0, lines_with_comments: 0,
  });
});

test("rejects invalid, out-of-bounds, and overlapping comment ranges", () => {
  for (const ranges of [null, {}, [{ start: 0, end: 0 }], [{ start: -1, end: 1 }],
    [{ start: 1, end: 4.5 }], [{ start: 1, end: 8 }]]) {
    assert.throws(() => classifyLexicalLines("text", ranges));
  }
  assert.throws(() => classifyLexicalLines("text", [{ start: 0, end: 3 }, { start: 2, end: 4 }]), /overlap/);
  assert.throws(() => classifyLexicalLines(1, []), /string/);
});

test("aggregates classified lines as a subset of ordinary totals", () => {
  const lexical = classifyLexicalLines(source, sourceComments);
  const lexicalBytes = Buffer.byteLength(source);
  const basicText = "Guide\n";
  const basicLines = countPhysicalLines(basicText);
  const files = [
    {
      path: "src/example.js", kind: "regular", git: { tracked: true }, measurement: "lexical",
      category: "source", role: "implementation", language: "javascript", extension: ".js",
      metrics: { bytes: lexicalBytes, ...lexical },
    },
    {
      path: "docs/guide.md", kind: "regular", git: { tracked: true }, measurement: "basic",
      category: "documentation", role: "documentation", language: "markdown", extension: ".md",
      metrics: { bytes: Buffer.byteLength(basicText), ...basicLines },
    },
  ];
  const result = aggregateResults(files, [], [{ index_kind: "regular" }, { index_kind: "regular" }]);
  const classified = { files: 1, bytes: lexicalBytes, ...lexical };
  assert.deepEqual(result.summary.totals.classified_lines, classified);
  assert.deepEqual(result.by_category.source.classified_lines, classified);
  assert.deepEqual(result.by_language.javascript.classified_lines, classified);
  assert.deepEqual(result.by_extension[".js"].classified_lines, classified);
  assert.deepEqual(result.by_role.implementation.classified_lines, classified);
  assert.deepEqual(result.source_composition.implementation.classified_lines, classified);
  assert.equal(result.by_category.documentation.classified_lines, null);
  assert.equal(result.summary.coverage.lexically_classified_files, 1);
});

test("result invariants check classified metrics and their subset aggregate", () => {
  const metrics = classifyLexicalLines(source, sourceComments);
  const bytes = Buffer.byteLength(source);
  const classified = { files: 1, bytes, ...metrics };
  const aggregate = aggregateFor(metrics, 1, bytes);
  const empty = emptyAggregate();
  const byCategory = Object.fromEntries(CATEGORIES.map((key) => [key, key === "source" ? aggregate : emptyAggregate()]));
  const byRole = Object.fromEntries(ROLES.map((key) => [key, key === "implementation" ? aggregate : emptyAggregate()]));
  const result = {
    schema_version: SCHEMA_VERSION,
    status: "ok",
    summary: {
      totals: aggregate,
      inventory: {
        tracked_entries: 1, excluded_entries: 0,
        included_entries: { regular: 1, symlink: 0, gitlink: 0, unresolved: 0 },
        metadata_only_entries: 0, ignored_metadata_only_entries: 0,
      },
      coverage: {
        included_regular_files: 1, bytes_measured_files: 1, text_measured_files: 1,
        lexically_classified_files: 1, basic_only_files: 0, binary_files: 0, unmeasured_files: 0,
      },
      diagnostic_counts: { total: 0, error: 0, warning: 0, info: 0 },
    },
    by_category: byCategory,
    by_language: { javascript: aggregate },
    by_extension: { ".js": aggregate },
    by_role: byRole,
    source_composition: { implementation: aggregate },
    diagnostics: [],
    files: [{
      path: "src/example.js", path_bytes_base64: undefined, git: { tracked: true },
      measurement: "lexical", comment_analysis: "available",
      metrics: { bytes, observed_bytes: bytes, ...metrics },
    }],
  };
  assert.equal(assertResultInvariants(result), result);
  const invalid = structuredClone(result);
  invalid.files[0].metrics.mixed_code_comment_lines += 1;
  invalid.files[0].metrics.lines_with_comments += 1;
  assert.throws(() => assertResultInvariants(invalid), /lexical mixed bound/);
  assert.notEqual(empty.classified_lines, classified);
});
