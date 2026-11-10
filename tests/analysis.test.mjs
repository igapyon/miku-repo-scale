import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fstatSync, mkdirSync, mkdtempSync, readFileSync, readSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { analyze } from "../src/runtime.mjs";
import { analyzeWithFilesystemAdapter } from "../src/analyze.mjs";
import { classifyPath, validateConfig } from "../src/classification.mjs";
import { assertResultInvariants, stableJson } from "../src/contracts.mjs";
import { createFilesystemAccessAdapter } from "../src/file-access.mjs";
import { isInsideGitAdministration, parseLsFiles, stripGitLineEnding } from "../src/git-inventory.mjs";
import { countPhysicalLines, mapPhysicalLines } from "../src/physical-lines.mjs";

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "miku-repo-scale analysis 日本語-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(repository, args) {
  execFileSync("git", ["-C", repository, ...args], { stdio: "ignore" });
}

function initRepository(repository) {
  mkdirSync(repository, { recursive: true });
  git(repository, ["init", "-q"]);
}

function mixedRepository(t) {
  const repository = join(temporaryDirectory(t), "fixture repository 日本語");
  initRepository(repository);
  writeFileSync(join(repository, ".gitignore"), "*.log\n");
  mkdirSync(join(repository, "cache"));
  writeFileSync(join(repository, "cache/.gitignore"), "secret.*\n");
  writeFileSync(join(repository, "README"), "Repository\n");
  writeFileSync(join(repository, "notes.txt"), "alpha\r\n \t\r\n\r\nomega\n");
  writeFileSync(join(repository, "web.html"), "<script>\nrun()\n</script>\n");
  writeFileSync(join(repository, "values.json"), '{"a":1}\n');
  writeFileSync(join(repository, "records.jsonl"), '{"a":1}\n\nnot-json\n');
  writeFileSync(join(repository, "cover.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]));
  writeFileSync(join(repository, "forced.log"), "tracked but ignored\n");
  writeFileSync(join(repository, "asset (final).dat"), "asset\n");
  mkdirSync(join(repository, "src"));
  mkdirSync(join(repository, "docs"));
  writeFileSync(join(repository, "src/main.mjs"), "const value = 1;\n");
  writeFileSync(join(repository, "src/AGENTS.md"), "Use these rules.\n");
  writeFileSync(join(repository, "docs/guide.md"), "# Guide\n\nBody");
  writeFileSync(join(repository, "openfile"), "one\r\n二\rthree");
  writeFileSync(join(repository, "wide.txt"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("wide\r\ntext", "utf16le")]));
  writeFileSync(join(repository, "symlink-target.txt"), "must not read through link\n");
  symlinkSync("symlink-target.txt", join(repository, "linked.txt"));
  git(repository, ["add", "--all"]);
  git(repository, ["add", "-f", "forced.log"]);
  writeFileSync(join(repository, "secret.log"), "ignored\n");
  writeFileSync(join(repository, "local.bin"), Buffer.from([0x00, 0x01, 0x02]));
  writeFileSync(join(repository, "cache/secret.bin"), Buffer.from([0x00, 0x02]));
  return repository;
}

test("physical-line rules count CRLF, LF, CR, and ASCII-only blank lines", () => {
  assert.deepEqual(countPhysicalLines(""), { total_physical_lines: 0, blank_lines: 0, nonblank_lines: 0 });
  assert.deepEqual(countPhysicalLines("\n"), { total_physical_lines: 1, blank_lines: 1, nonblank_lines: 0 });
  assert.deepEqual(countPhysicalLines("a\n\n"), { total_physical_lines: 2, blank_lines: 1, nonblank_lines: 1 });
  assert.deepEqual(countPhysicalLines("\r\na\rb\r\n"), { total_physical_lines: 3, blank_lines: 1, nonblank_lines: 2 });
  assert.deepEqual(countPhysicalLines(" \t\f\v\n\u00a0\nx\u2028y"), { total_physical_lines: 3, blank_lines: 1, nonblank_lines: 2 });
  assert.deepEqual(mapPhysicalLines("😀\r\n\nx"), {
    total_physical_lines: 3,
    blank_lines: 1,
    nonblank_lines: 2,
    lines: [
      { start_offset: 0, content_end_offset: 2, terminator_start_offset: 2, terminator_length: 2 },
      { start_offset: 4, content_end_offset: 4, terminator_start_offset: 4, terminator_length: 1 },
      { start_offset: 5, content_end_offset: 6, terminator_start_offset: 6, terminator_length: 0 },
    ],
  });
});

test("versioned JSON Schemas validate real result and config documents", (t) => {
  const resultSchema = JSON.parse(readFileSync(new URL("../schemas/result-v1.schema.json", import.meta.url), "utf8"));
  const configSchema = JSON.parse(readFileSync(new URL("../schemas/config-v1.schema.json", import.meta.url), "utf8"));
  assert.equal(resultSchema.properties.schema_version.const, "miku-repo-scale.result/v1");
  assert.ok(resultSchema.$defs.file.properties.metrics);
  assert.equal(configSchema.properties.schema_version.const, "miku-repo-scale.config/v1");
  const validator = new Ajv2020({ allErrors: true, strict: false });
  validator.addSchema(configSchema);
  const validateResult = validator.compile(resultSchema);
  const validateConfigDocument = validator.compile(configSchema);
  const repository = join(temporaryDirectory(t), "schema repository");
  initRepository(repository);
  const result = analyze({ root: repository });
  assert.equal(validateResult(result), true, JSON.stringify(validateResult.errors));
  assert.equal(validateConfigDocument({ schema_version: "miku-repo-scale.config/v1", rules: [] }), true);
  const invalid = structuredClone(result);
  invalid.summary.totals.bytes = -1;
  assert.equal(validateResult(invalid), false);
});

test("Git index byte parser groups unmerged stages and preserves control characters", () => {
  const object = "0123456789012345678901234567890123456789";
  const record = (stage) => Buffer.concat([Buffer.from(`100644 ${object} ${stage}\tname with\ttab\nline.txt`, "utf8"), Buffer.from([0])]);
  const output = Buffer.concat([record(1), record(2)]);
  const entries = parseLsFiles(output);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].pathBytes.toString("utf8"), "name with\ttab\nline.txt");
  assert.deepEqual(entries[0].stages.map((stage) => stage.stage), [1, 2]);
});

test("Git text output strips LF and Windows CRLF terminators", () => {
  assert.equal(stripGitLineEnding("false\n", "darwin"), "false");
  assert.equal(stripGitLineEnding("false\r\n", "win32"), "false");
  assert.equal(stripGitLineEnding("directory\r\n", "darwin"), "directory\r");
  assert.equal(stripGitLineEnding("directory", "win32"), "directory");
});

test("Git administration path checks are case-insensitive on Windows", () => {
  assert.equal(isInsideGitAdministration("C:\\Repo\\.git\\report.json", "c:/repo/.git", "C:\\Repo\\.git", "win32"), true);
  assert.equal(isInsideGitAdministration("C:\\Repo\\.git-backup\\report.json", "C:\\Repo\\.git", "C:\\Repo\\.git", "win32"), false);
});

test("empty repository, empty text, BOM-only text, and YAML keep zero distinct from null", (t) => {
  const repository = join(temporaryDirectory(t), "empty repository");
  initRepository(repository);
  const noFiles = analyze({ root: repository });
  assert.equal(noFiles.status, "ok");
  assert.equal(noFiles.summary.totals.files, 0);
  assert.equal(noFiles.summary.totals.total_physical_lines, 0);
  assert.equal(noFiles.summary.coverage.text_measured_files, 0);

  writeFileSync(join(repository, "empty.txt"), "");
  writeFileSync(join(repository, "bom.txt"), Buffer.from([0xef, 0xbb, 0xbf]));
  writeFileSync(join(repository, "settings.yml"), "first: yes\nsecond: no\n");
  git(repository, ["add", "--all"]);
  const result = analyze({ root: repository });
  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(result.summary.totals.files, 3);
  assert.equal(result.summary.totals.total_physical_lines, 2);
  assert.equal(result.summary.coverage.text_measured_files, 3);
  assert.equal(files.get("empty.txt").metrics.total_physical_lines, 0);
  assert.equal(files.get("bom.txt").metrics.total_physical_lines, 0);
  assert.equal(files.get("settings.yml").language, "yaml");
  assert.equal(files.get("settings.yml").metrics.total_physical_lines, 2);
  const invalid = structuredClone(result);
  invalid.summary.coverage.basic_only_files = 1;
  assert.throws(() => assertResultInvariants(invalid), /text coverage partition/);
});

test("leading U+FEFF filenames remain distinct from ordinary names", (t) => {
  const repository = join(temporaryDirectory(t), "path identity repository");
  initRepository(repository);
  writeFileSync(join(repository, "notes.txt"), "ordinary\n");
  writeFileSync(join(repository, "\uFEFFnotes.txt"), "first\nsecond\nthird\n");
  git(repository, ["add", "--all"]);

  const result = analyze({ root: repository });
  assert.equal(result.status, "ok");
  assert.equal(result.summary.totals.files, 2);
  assert.equal(result.summary.totals.total_physical_lines, 4);
  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(files.get("notes.txt").metrics.bytes, Buffer.byteLength("ordinary\n"));
  assert.equal(files.get("notes.txt").metrics.total_physical_lines, 1);
  assert.equal(files.get("\uFEFFnotes.txt").metrics.bytes, Buffer.byteLength("first\nsecond\nthird\n"));
  assert.equal(files.get("\uFEFFnotes.txt").metrics.total_physical_lines, 3);
  const duplicate = structuredClone(result);
  duplicate.files[1].path = duplicate.files[0].path;
  assert.throws(() => assertResultInvariants(duplicate), /duplicate file path identity/);
});

test("UTF-8 BOM does not exempt NUL-containing files from binary detection", (t) => {
  const repository = join(temporaryDirectory(t), "nul repository");
  initRepository(repository);
  const plainNul = Buffer.from([0x61, 0x00]);
  const bomNul = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x00]);
  writeFileSync(join(repository, "plain.dat"), plainNul);
  writeFileSync(join(repository, "bom.dat"), bomNul);
  git(repository, ["add", "--all"]);

  const files = new Map(analyze({ root: repository }).files.map((file) => [file.path, file]));
  for (const [name, bytes] of [["plain.dat", plainNul], ["bom.dat", bomNul]]) {
    assert.equal(files.get(name).measurement, "binary");
    assert.equal(files.get(name).binary_type, "nul_byte");
    assert.equal(files.get(name).metrics.bytes, bytes.length);
    assert.equal(files.get(name).metrics.total_physical_lines, null);
  }
});

test("explicit Shell dialects normalize into the shell source aggregate", (t) => {
  const repository = join(temporaryDirectory(t), "shell classification repository");
  initRepository(repository);
  for (const [name, content] of [["sh-script", "one\n"], ["bash-script", "one\ntwo\n"], ["zsh-script", "one\ntwo\nthree\n"], ["plain-script", "plain\n"], ["special.sh", "test\n"], ["dist/generated.sh", "generated\n"]]) {
    const path = join(repository, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  git(repository, ["add", "--all"]);
  const result = analyze({ root: repository, config: {
    schema_version: "miku-repo-scale.config/v1",
    rules: [
      { match: "sh-script", language: "shell-sh" },
      { match: "bash-script", language: "shell-bash" },
      { match: "zsh-script", language: "shell-zsh" },
      { match: "plain-script", language: "shell-bash" },
      { match: "special.sh", language: "shell-zsh", role: "data", category: "test" },
      { match: "dist/generated.sh", language: "shell-sh" },
    ],
  } });

  assert.equal(result.status, "ok");
  const files = new Map(result.files.map((file) => [file.path, file]));
  for (const name of ["sh-script", "bash-script", "zsh-script", "plain-script", "special.sh", "dist/generated.sh"]) {
    assert.equal(files.get(name).language, "shell", name);
  }
  for (const name of ["sh-script", "bash-script", "plain-script", "dist/generated.sh"]) {
    assert.equal(files.get(name).measurement, "lexical", name);
    assert.equal(files.get(name).comment_analysis, "available", name);
  }
  for (const name of ["zsh-script", "special.sh"]) {
    assert.equal(files.get(name).measurement, "basic", name);
    assert.equal(files.get(name).comment_analysis, "unsupported", name);
    assert.equal(files.get(name).metrics.code_lines, null, name);
  }
  for (const [name, dialect] of [["sh-script", "sh"], ["bash-script", "bash"], ["zsh-script", "zsh"], ["plain-script", "bash"], ["special.sh", "zsh"], ["dist/generated.sh", "sh"]]) {
    assert.equal(classifyPath(name, validateConfig({
      schema_version: "miku-repo-scale.config/v1", rules: [{ match: name, language: `shell-${dialect}` }],
    })).language_dialect, dialect);
  }
  assert.equal(files.get("sh-script").role, "implementation");
  assert.equal(files.get("sh-script").category, "source");
  assert.equal(files.get("plain-script").category, "source");
  assert.equal(files.get("special.sh").role, "data");
  assert.equal(files.get("special.sh").category, "test");
  assert.equal(files.get("dist/generated.sh").category, "generated");
  assert.equal(result.source_composition.implementation.files, 4);
  assert.equal(result.by_language.shell.files, 6);
  assert.equal(result.summary.coverage.lexically_classified_files, 4);
  assert.equal(result.by_language.shell.classified_lines.files, 4);
  assert.equal(result.diagnostics.filter((item) => item.code === "COMMENT_ANALYSIS_UNSUPPORTED").length, 2);
});

test("known basenames and shebangs refine language and report unsupported or conflicting forms", (t) => {
  const repository = join(temporaryDirectory(t), "shebang repository");
  initRepository(repository);
  const contents = new Map([
    [".bashrc", "echo bash\n"], [".bash_profile", "echo profile\n"], [".zshrc", "echo zsh\n"], [".zprofile", "echo profile\n"],
    ["plain-script", "#!/usr/bin/env python3\nprint(1)\n"], ["run.sh", "#!/bin/bash\necho yes\n"],
    ["run.bash", "#!/bin/sh\necho mismatch\n"], ["complex-script", "#!/usr/bin/env -S bash -e\necho complex\n"],
    ["node-script", "#!/usr/bin/env node\nconsole.log(1)\n"], ["explicit-script", "#!/usr/bin/env zsh\necho explicit\n"],
  ]);
  for (const [name, content] of contents) writeFileSync(join(repository, name), content);
  git(repository, ["add", "--all"]);
  const result = analyze({ root: repository, config: {
    schema_version: "miku-repo-scale.config/v1", rules: [{ match: "explicit-script", language: "shell-bash" }],
  } });

  assert.equal(result.status, "ok");
  const files = new Map(result.files.map((file) => [file.path, file]));
  for (const name of [".bashrc", ".bash_profile", ".zshrc", ".zprofile", "run.sh", "run.bash"]) {
    assert.equal(files.get(name).language, "shell", name);
    assert.equal(files.get(name).role, "implementation", name);
    assert.equal(files.get(name).category, "source", name);
  }
  assert.equal(files.get("plain-script").language, "python");
  assert.equal(files.get("plain-script").language_reason, "shebang:python3");
  assert.equal(files.get("node-script").language, "javascript");
  assert.equal(result.source_composition.implementation.files, 9);
  assert.equal(result.by_language.shell.files, 7);
  assert.equal(result.by_language.python.files, 1);
  assert.equal(result.by_language.javascript.files, 1);
  assert.equal(files.get("complex-script").language, "unknown");
  assert.equal(files.get("complex-script").measurement, "basic");
  assert.equal(files.get("complex-script").comment_analysis, "not_requested");
  assert.equal(files.get("explicit-script").language, "shell");
  assert.equal(files.get("run.bash").measurement, "basic");
  assert.equal(files.get("run.bash").comment_analysis, "unsupported");
  assert.equal(files.get("explicit-script").measurement, "basic");
  assert.equal(files.get("explicit-script").comment_analysis, "unsupported");
  assert.equal(result.input.config.rules[0].language, "shell-bash");
  assert.ok(result.diagnostics.some((item) => item.code === "SHEBANG_UNSUPPORTED" && item.path === "complex-script"));
  assert.ok(result.diagnostics.some((item) => item.code === "SHEBANG_DIALECT_MISMATCH" && item.path === "run.bash"));
  assert.ok(result.diagnostics.some((item) => item.code === "SHEBANG_DIALECT_MISMATCH" && item.path === "explicit-script"));
});

test("invalid UTF-8 Git paths keep distinct raw-byte identities in summary diagnostics", (t) => {
  const repository = join(temporaryDirectory(t), "invalid path repository");
  initRepository(repository);
  const object = execFileSync("git", ["-C", repository, "hash-object", "-w", "--stdin"], { input: Buffer.alloc(0), encoding: "utf8" }).trim();
  const rawPaths = [Buffer.from([0x62, 0x61, 0x64, 0x2d, 0xff, 0x2e, 0x74, 0x78, 0x74]), Buffer.from([0x62, 0x61, 0x64, 0x2d, 0xfe, 0x2e, 0x74, 0x78, 0x74])];
  const indexInfo = Buffer.concat(rawPaths.map((pathBytes) => Buffer.concat([
    Buffer.from(`100644 ${object} 0\t`, "ascii"), pathBytes, Buffer.from([0]),
  ])));
  const update = spawnSync("git", ["-C", repository, "update-index", "-z", "--index-info"], { input: indexInfo });
  assert.equal(update.status, 0, update.stderr.toString());

  const filesResult = analyze({ root: repository });
  const summaryResult = analyze({ root: repository, detail: "summary" });
  const encoded = rawPaths.map((pathBytes) => pathBytes.toString("base64"));
  assert.equal(filesResult.status, "partial");
  assert.equal(filesResult.files.length, 2);
  assert.deepEqual(filesResult.files.map((file) => file.path_bytes_base64).sort(), encoded.sort());
  assert.deepEqual(filesResult.diagnostics.map((item) => item.details.path_bytes_base64).sort(), encoded);
  assert.deepEqual(summaryResult.diagnostics, filesResult.diagnostics);
  assert.equal(summaryResult.files, undefined);
  const validator = new Ajv2020({ allErrors: true, strict: false });
  validator.addSchema(JSON.parse(readFileSync(new URL("../schemas/config-v1.schema.json", import.meta.url), "utf8")));
  const validateResult = validator.compile(JSON.parse(readFileSync(new URL("../schemas/result-v1.schema.json", import.meta.url), "utf8")));
  assert.equal(validateResult(filesResult), true, JSON.stringify(validateResult.errors));
  assert.equal(validateResult(summaryResult), true, JSON.stringify(validateResult.errors));
});

test("file access boundary stops parent symlink swaps before reading outside content", (t) => {
  for (const racePoint of ["after_parent_check", "before_open", "after_open_before_read"]) {
    const directory = temporaryDirectory(t);
    const repository = join(directory, "repository");
    const parent = join(repository, "nested");
    const movedParent = join(repository, "nested-original");
    const outside = join(directory, "outside");
    mkdirSync(parent, { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(parent, "file.txt"), "inside\n");
    writeFileSync(join(outside, "file.txt"), "outside sentinel\n");
    initRepository(repository);
    git(repository, ["add", "--all"]);
    const externalIdentity = statSync(join(outside, "file.txt"));
    let externalReadCalls = 0;
    let injected = false;
    const adapter = createFilesystemAccessAdapter({
      checkpoint(stage) {
        if (stage !== racePoint || injected) return;
        injected = true;
        renameSync(parent, movedParent);
        symlinkSync(outside, parent);
      },
      read(descriptor, buffer, offset, length, position) {
        const opened = fstatSync(descriptor);
        if (opened.dev === externalIdentity.dev && opened.ino === externalIdentity.ino) externalReadCalls += 1;
        return readSync(descriptor, buffer, offset, length, position);
      },
    });

    const result = analyzeWithFilesystemAdapter({ root: repository }, adapter);
    const file = result.files.find((entry) => entry.path === "nested/file.txt");
    assert.equal(injected, true, racePoint);
    assert.equal(externalReadCalls, 0, racePoint);
    assert.equal(result.status, "partial", racePoint);
    assert.equal(file.measurement, "error", racePoint);
    assert.equal(file.metrics.bytes, null, racePoint);
  }
});

test("tracked repository summary covers text, data, instructions, binaries, and symlink metadata", (t) => {
  const repository = mixedRepository(t);
  const result = analyze({ root: repository });
  assert.equal(result.status, "ok");
  assert.equal(result.schema_version, "miku-repo-scale.result/v1");
  assert.equal(result.summary.inventory.tracked_entries, 17);
  assert.deepEqual(result.summary.inventory.included_entries, { regular: 16, symlink: 1, gitlink: 0, unresolved: 0 });
  assert.equal(result.summary.coverage.included_regular_files, 16);
  assert.equal(result.summary.coverage.text_measured_files, 15);
  assert.equal(result.summary.coverage.lexically_classified_files, 1);
  assert.equal(result.summary.coverage.basic_only_files, 14);
  assert.equal(result.summary.coverage.binary_files, 1);
  assert.equal(result.summary.totals.total_physical_lines, 27);
  assert.equal(result.summary.totals.blank_lines, 4);
  assert.equal(result.summary.totals.nonblank_lines, 23);
  assert.equal(result.summary.totals.classified_lines.files, 1);

  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.deepEqual(files.get("notes.txt").metrics, {
    bytes: Buffer.byteLength("alpha\r\n \t\r\n\r\nomega\n"), observed_bytes: null,
    total_physical_lines: 4, blank_lines: 2, nonblank_lines: 2,
    comment_only_lines: null, code_lines: null, mixed_code_comment_lines: null, lines_with_comments: null,
  });
  assert.equal(files.get("web.html").metrics.total_physical_lines, 3);
  assert.equal(files.get("records.jsonl").metrics.total_physical_lines, 3);
  assert.equal(files.get("records.jsonl").comment_analysis, "not_requested");
  assert.equal(files.get("src/AGENTS.md").role, "instruction");
  assert.equal(files.get("src/AGENTS.md").category, "source");
  assert.equal(files.get("src/main.mjs").measurement, "lexical");
  assert.equal(files.get("src/main.mjs").comment_analysis, "available");
  assert.equal(files.get("src/main.mjs").metrics.code_lines, 1);
  assert.equal(files.get("cover.png").measurement, "binary");
  assert.equal(files.get("cover.png").binary_type, "png");
  assert.equal(files.get("cover.png").size_bytes, 10);
  assert.equal(files.get("linked.txt").measurement, "skipped");
  assert.equal(files.get("linked.txt").skip_reason, "symlink");
  assert.equal(files.get("forced.log").git.ignore.would_ignore, true);
  assert.equal(files.get("forced.log").git.ignore.rule.source_kind, "root_gitignore");
  assert.equal(files.get("forced.log").git.ignore.rule.pattern, "*.log");
  assert.equal(files.get("wide.txt").metrics.total_physical_lines, 2);
  assert.equal(result.source_composition.instruction.files, 1);
  assert.equal(result.source_composition.implementation.files, 1);
  assert.equal(result.by_extension[".jsonl"].total_physical_lines, 3);
  assert.equal(result.by_extension[""].files, 4);
});

test("all inventory adds ignored and untracked metadata without adding their bytes to measurements", (t) => {
  const repository = mixedRepository(t);
  const result = analyze({ root: repository, inventory: "all" });
  assert.equal(result.status, "ok");
  assert.equal(result.summary.inventory.metadata_only_entries, 3);
  assert.equal(result.summary.inventory.ignored_metadata_only_entries, 2);
  assert.equal(result.summary.totals.total_physical_lines, 27);
  const local = result.files.find((file) => file.path === "local.bin");
  const secret = result.files.find((file) => file.path === "secret.log");
  const nested = result.files.find((file) => file.path === "cache/secret.bin");
  assert.equal(local.measurement, "skipped");
  assert.equal(local.skip_reason, "untracked_metadata_only");
  assert.equal(local.size_bytes, 3);
  assert.equal(local.metrics.bytes, null);
  assert.equal(secret.git.ignore.would_ignore, true);
  assert.equal(secret.git.ignore.rule.source_kind, "root_gitignore");
  assert.equal(nested.git.ignore.would_ignore, true);
  assert.equal(nested.git.ignore.rule.source_kind, "nested_gitignore");
});

test("ignore metadata identifies info/exclude and global rules and honors negation", (t) => {
  const directory = temporaryDirectory(t);
  const repository = join(directory, "ignore repository");
  initRepository(repository);
  writeFileSync(join(repository, ".gitignore"), "*.log\n!keep.log\n");
  git(repository, ["add", ".gitignore"]);
  writeFileSync(join(repository, ".git/info/exclude"), "info.bin\n", { flag: "a" });
  const globalIgnore = join(repository, "global excludes.txt");
  const globalConfig = join(directory, "git-config");
  writeFileSync(globalIgnore, "global.bin\n");
  writeFileSync(globalConfig, `[core]\n\texcludesFile = ${globalIgnore.replaceAll("\\", "/")}\n`);
  writeFileSync(join(repository, "ignored.log"), "ignored\n");
  writeFileSync(join(repository, "keep.log"), "visible\n");
  writeFileSync(join(repository, "info.bin"), Buffer.from([0x00]));
  writeFileSync(join(repository, "global.bin"), Buffer.from([0x00]));

  const previous = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = globalConfig;
  let result;
  try { result = analyze({ root: repository, inventory: "all" }); }
  finally {
    if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous;
  }

  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(result.status, "ok");
  assert.equal(files.get("ignored.log").git.ignore.rule.source_kind, "root_gitignore");
  assert.equal(files.get("keep.log").git.ignore.would_ignore, false);
  assert.equal(files.get("info.bin").git.ignore.rule.source_kind, "info_exclude");
  assert.equal(files.get("global.bin").git.ignore.rule.source_kind, "global");
  assert.equal(files.get("global.bin").git.ignore.rule.source, null);
});

test("filters, ordered config rules, and summary detail are deterministic", (t) => {
  const repository = mixedRepository(t);
  const options = {
    root: repository,
    include: ["**/*.jsonl", "records.jsonl"],
    exclude: ["**/no-match/**"],
    detail: "summary",
    config: {
      schema_version: "miku-repo-scale.config/v1",
      rules: [
        { match: "records.jsonl", role: "data" },
        { match: "records.jsonl", category: "test" },
      ],
    },
  };
  const first = analyze(options);
  const second = analyze(options);
  assert.equal(first.status, "ok");
  assert.equal(first.detail, "summary");
  assert.equal(first.files, undefined);
  assert.equal(first.summary.totals.files, 1);
  assert.equal(first.summary.totals.total_physical_lines, 3);
  assert.equal(first.by_role.data.files, 1);
  assert.equal(first.by_category.test.files, 1);
  assert.equal(first.summary.inventory.excluded_entries, 16);
  assert.equal(stableJson(first), stableJson(second));
});

test("strict decode failures and size limits remain visible as unmeasured files", (t) => {
  const repository = join(temporaryDirectory(t), "decode repository");
  initRepository(repository);
  writeFileSync(join(repository, "bad.txt"), Buffer.from([0x61, 0xff]));
  writeFileSync(join(repository, "large.txt"), "0123456789");
  git(repository, ["add", "--all"]);
  const result = analyze({ root: repository, maxFileBytes: 4 });
  assert.equal(result.status, "partial");
  assert.equal(result.summary.coverage.included_regular_files, 2);
  assert.equal(result.summary.coverage.unmeasured_files, 2);
  const bad = result.files.find((file) => file.path === "bad.txt");
  const large = result.files.find((file) => file.path === "large.txt");
  assert.equal(bad.measurement, "error");
  assert.equal(bad.metrics.bytes, 2);
  assert.equal(result.diagnostics.find((item) => item.path === "bad.txt").code, "TEXT_DECODE_ERROR");
  assert.equal(large.measurement, "skipped");
  assert.equal(large.metrics.bytes, null);
  assert.equal(large.metrics.observed_bytes, 10);
  assert.equal(result.diagnostics.find((item) => item.path === "large.txt").code, "SIZE_LIMIT");
});

test("subdirectory roots and invalid configs return structured error envelopes", (t) => {
  const repository = mixedRepository(t);
  const subdirectory = join(repository, "src");
  const wrongRoot = analyze({ root: subdirectory });
  assert.equal(wrongRoot.status, "error");
  assert.equal(wrongRoot.diagnostics[0].code, "ROOT_NOT_REPOSITORY_ROOT");
  const summaryError = analyze({ root: subdirectory, detail: "summary" });
  assert.equal(summaryError.files, undefined);
  const badConfig = analyze({ root: repository, config: { schema_version: "miku-repo-scale.config/v1", rules: [], surprise: true } });
  assert.equal(badConfig.status, "error");
  assert.equal(badConfig.diagnostics[0].code, "INVALID_CONFIG_OR_OPTIONS");
});
