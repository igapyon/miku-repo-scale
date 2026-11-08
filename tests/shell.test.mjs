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
  const root = mkdtempSync(join(tmpdir(), "miku-repo-scale shell lexer-"));
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

test("Bash grammar distinguishes shell comments from words, expansions, quotes, and heredoc bodies", () => {
  const fixtureText = fixture("shell-heredoc.bash");
  const parsedFixture = lexSource({ language: "shell", extension: ".bash", dialect: "bash", text: fixtureText });
  assert.equal(parsedFixture.status, "available");
  assert.deepEqual(parsedFixture.comment_ranges.map(({ start, end }) => [start, end]), [[89, 119], [126, 148]]);
  assert.deepEqual(parsedFixture.comment_ranges.map(({ start, end }) => fixtureText.slice(start, end)), [
    "# command substitution comment",
    "# shell source comment",
  ]);

  const source = [
    "#!/usr/bin/env bash",
    "echo token#suffix \\#escaped",
    "echo '# in single quotes' \"# in double quotes\"",
    "printf '%s\\n' \"${HOME#prefix}\" # trailing shell comment",
    "cat <<'QUOTED' <<-TABS",
    "# quoted heredoc data, not a shell comment",
    "QUOTED",
    "\t# tab-indented heredoc data, not a shell comment",
    "\tTABS",
    "$(printf '%s\\n' value # command substitution comment",
    ")",
    "# final source comment",
    "",
  ].join("\r\n");
  const parsed = lexSource({ language: "shell", extension: ".bash", dialect: "bash", text: source });
  assert.equal(parsed.status, "available");
  assert.deepEqual(parsed.comment_ranges.map(({ start, end }) => source.slice(start, end)), [
    "#!/usr/bin/env bash",
    "# trailing shell comment",
    "# command substitution comment",
    "# final source comment",
  ]);

  const mixedLineEndings = "echo first # inline\r\n# lone-CR line\rprintf value # after CR\r";
  const parsedMixed = lexSource({ language: "shell", extension: ".bash", dialect: "bash", text: mixedLineEndings });
  assert.equal(parsedMixed.status, "available");
  assert.deepEqual(parsedMixed.comment_ranges.map(({ start, end }) => mixedLineEndings.slice(start, end)), [
    "# inline",
    "# lone-CR line",
    "# after CR",
  ]);
});

test("shell analysis maps comments to original CRLF lines and keeps dialect conflicts visible", (t) => {
  const root = repository(t);
  const complex = [
    "#!/usr/bin/env bash",
    "echo token#suffix \\#escaped",
    "echo '# in single quotes' \"# in double quotes\"",
    "printf '%s\\n' \"${HOME#prefix}\" # trailing shell comment",
    "cat <<'QUOTED' <<-TABS",
    "# quoted heredoc data, not a shell comment",
    "QUOTED",
    "\t# tab-indented heredoc data, not a shell comment",
    "\tTABS",
    "$(printf '%s\\n' value # command substitution comment",
    ")",
    "# final source comment",
    "",
  ].join("\r\n");
  const portable = [
    "#!/bin/sh",
    "printf '%s\\n' \"$HOME\" # portable comment",
    "# comment only",
    "",
    "echo done",
    "",
  ].join("\r\n");
  write(root, "src/complex.bash", complex);
  write(root, "src/portable.sh", portable);
  write(root, "src/from-shebang", "#!/usr/bin/env bash\nprintf 'ok' # shebang selected Bash\n");
  write(root, "src/mismatch.bash", "#!/bin/sh\necho mismatch # not classified under conflicting dialect\n");
  write(root, "src/unsupported.zsh", "#!/bin/zsh\nprint '# string content'\n");
  write(root, "src/bash-only.sh", "[[ -n $HOME ]] && echo Bash-only\n");
  write(root, "src/broken.bash", "if true; then\n  echo unfinished\n");
  execFileSync("git", ["-C", root, "add", "--all"]);

  const result = analyze({ root });
  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(result.status, "ok");

  const measuredComplex = files.get("src/complex.bash");
  assert.equal(measuredComplex.measurement, "lexical");
  assert.equal(measuredComplex.metrics.total_physical_lines, 12);
  assert.equal(measuredComplex.metrics.blank_lines, 0);
  assert.equal(measuredComplex.metrics.comment_only_lines, 1);
  assert.equal(measuredComplex.metrics.code_lines, 11);
  assert.equal(measuredComplex.metrics.mixed_code_comment_lines, 2);
  assert.equal(measuredComplex.metrics.lines_with_comments, 3);

  const measuredPortable = files.get("src/portable.sh");
  assert.equal(measuredPortable.language, "shell");
  assert.equal(measuredPortable.language_reason, "extension:.sh");
  assert.equal(measuredPortable.measurement, "lexical");
  assert.equal(measuredPortable.metrics.total_physical_lines, 5);
  assert.equal(measuredPortable.metrics.blank_lines, 1);
  assert.equal(measuredPortable.metrics.comment_only_lines, 1);
  assert.equal(measuredPortable.metrics.code_lines, 3);
  assert.equal(measuredPortable.metrics.mixed_code_comment_lines, 1);
  assert.equal(measuredPortable.metrics.lines_with_comments, 2);

  assert.equal(files.get("src/from-shebang").language_reason, "shebang:bash");
  assert.equal(files.get("src/from-shebang").measurement, "lexical");
  assert.equal(files.get("src/from-shebang").metrics.mixed_code_comment_lines, 1);

  const mismatch = files.get("src/mismatch.bash");
  assert.equal(mismatch.language, "shell");
  assert.equal(mismatch.language_reason, "extension:.bash");
  assert.equal(mismatch.measurement, "basic");
  assert.equal(mismatch.comment_analysis, "unsupported");
  assert.equal(mismatch.metrics.code_lines, null);

  const unsupported = files.get("src/unsupported.zsh");
  assert.equal(unsupported.language, "shell");
  assert.equal(unsupported.language_reason, "extension:.zsh");
  assert.equal(unsupported.measurement, "basic");
  assert.equal(unsupported.comment_analysis, "unsupported");
  assert.equal(unsupported.metrics.code_lines, null);

  const bashOnlyInSh = files.get("src/bash-only.sh");
  assert.equal(bashOnlyInSh.language, "shell");
  assert.equal(bashOnlyInSh.measurement, "basic");
  assert.equal(bashOnlyInSh.comment_analysis, "unsupported");
  assert.equal(bashOnlyInSh.metrics.code_lines, null);

  const broken = files.get("src/broken.bash");
  assert.equal(broken.measurement, "basic");
  assert.equal(broken.comment_analysis, "error");
  assert.equal(broken.metrics.total_physical_lines, 2);
  assert.equal(broken.metrics.code_lines, null);

  assert.deepEqual(result.diagnostics.map(({ code, severity, path }) => [code, severity, path]), [
    ["COMMENT_ANALYSIS_UNSUPPORTED", "warning", "src/bash-only.sh"],
    ["LEXICAL_ERROR", "warning", "src/broken.bash"],
    ["SHEBANG_DIALECT_MISMATCH", "warning", "src/mismatch.bash"],
    ["COMMENT_ANALYSIS_UNSUPPORTED", "warning", "src/unsupported.zsh"],
  ]);
  assert.equal(result.summary.coverage.lexically_classified_files, 3);
  assert.equal(result.by_language.shell.classified_lines.files, 3);
});

test("shell dialect selection supports sh and Bash while leaving Zsh unsupported", () => {
  for (const dialect of ["sh", "bash"]) {
    const parsed = lexSource({ language: "shell", extension: dialect === "sh" ? ".sh" : ".bash", dialect, text: "echo ok # comment\n" });
    assert.equal(parsed.status, "available", dialect);
    assert.equal(parsed.comment_ranges.length, 1, dialect);
  }
  assert.deepEqual(lexSource({ language: "shell", extension: ".zsh", dialect: "zsh", text: "print ok\n" }), {
    status: "unsupported",
    reason: "dialect",
  });
  assert.deepEqual(lexSource({ language: "shell", extension: ".sh", dialect: "sh", text: "[[ -n $HOME ]]\n" }), {
    status: "unsupported",
    reason: "dialect_syntax",
  });
  assert.deepEqual(lexSource({ language: "shell", text: "echo ok\n" }), {
    status: "unsupported",
    reason: "dialect",
  });
});

test("sh rejects syntax nodes that are specific to Bash", () => {
  const bashOnly = [
    ["conditional", "[[ -n $HOME ]]\n"],
    ["array", "values=(one two)\n"],
    ["arithmetic command", "(( 1 + 1 ))\n"],
    ["C-style for", "for ((i=0; i < 1; i++)); do :; done\n"],
    ["process substitution", "cat <(printf x)\n"],
    ["here-string", "cat <<<x\n"],
    ["coprocess", "coproc cat\n"],
    ["ANSI-C quote", "printf '%s' $'value'\n"],
    ["function keyword", "function f { :; }\n"],
  ];

  for (const [syntax, text] of bashOnly) {
    assert.deepEqual(lexSource({ language: "shell", extension: ".sh", dialect: "sh", text }), {
      status: "unsupported",
      reason: "dialect_syntax",
    }, syntax);
  }
});
