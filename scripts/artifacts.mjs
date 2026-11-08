import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const product = "miku-repo-scale";

export function readPackage(projectRoot = root) {
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(projectRoot, "package-lock.json"), "utf8"));
  assert.equal(pkg.name, product);
  assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(lock.version, pkg.version, "lockfile version must match package.json");
  assert.equal(lock.packages[""].version, pkg.version, "lockfile root package must match");
  return pkg;
}

export function releaseVersion(tag, projectRoot = root) {
  const { version } = readPackage(projectRoot);
  assert.equal(typeof tag, "string", "Set TAG_NAME to the pushed Git tag");
  const prefix = `v${version}`;
  assert.ok(tag === prefix || (tag.startsWith(`${prefix}.`) && /^[1-9]\d*$/.test(tag.slice(prefix.length + 1))),
    `Release tag must be ${prefix} or ${prefix}.N (positive integer suffix)`);
  return tag.slice(1);
}

export function artifactPaths(projectRoot = root, version) {
  const dir = join(projectRoot, version ? "release-assets" : "bundle");
  return {
    cli: join(dir, `${product}${version ? `-${version}` : ""}.mjs`),
    runtime: join(dir, `${product}-runtime${version ? `-${version}` : ""}.mjs`),
    sources: join(dir, `${product}-sources${version ? `-${version}` : ""}.tgz`),
  };
}

export function requireFile(path) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && stat.size > 0, `Expected a nonempty regular file: ${path}`);
}

const sourceRoots = [
  "src", "scripts", "tests", "docs", "schemas", ".github", ".editorconfig", ".gitattributes", ".gitignore",
  "package.json", "package-lock.json", "README.md", "TODO.md", "LICENSE",
  "THIRD_PARTY_NOTICES.md", "CONTRIBUTING.md", "CONTRIBUTORS.md",
];

export function sourceFiles(projectRoot = root) {
  const files = [];
  function visit(relativePath) {
    if (basename(relativePath) === ".gitkeep") return;
    const stat = lstatSync(join(projectRoot, relativePath));
    if (stat.isDirectory()) {
      for (const entry of readdirSync(join(projectRoot, relativePath))) visit(`${relativePath}/${entry}`);
    } else {
      assert.ok(stat.isFile(), `Source archive accepts regular files only: ${relativePath}`);
      files.push(relativePath);
    }
  }
  sourceRoots.forEach(visit);
  return files.sort();
}

function withIsolatedFile(path, run) {
  requireFile(path);
  const directory = mkdtempSync(join(tmpdir(), "miku-repo-scale 日本語-"));
  try {
    const isolatedPath = join(directory, basename(path));
    copyFileSync(path, isolatedPath);
    run(isolatedPath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function makeSmokeRepository(directory) {
  const repository = join(directory, "fixture repository 日本語");
  mkdirSync(repository);
  writeFileSync(join(repository, "notes.txt"), "first\r\n\r\nlast");
  writeFileSync(join(repository, "records.jsonl"), '{"a":1}\n\nnot-json\n');
  writeFileSync(join(repository, "script.py"), "# Python comment\nprint('ok')\n");
  writeFileSync(join(repository, "JavaSmoke.java"), "class JavaSmoke {\n  \\u002f\\u002f comment\n}\n");
  writeFileSync(join(repository, "ShellSmoke.bash"), "#!/usr/bin/env bash\necho token#suffix # trailing comment\ncat <<'END'\n# heredoc data\nEND\n# shell comment\n");
  writeFileSync(join(repository, "ShellPortable.sh"), "#!/bin/sh\nprintf '%s\\n' \"$HOME\" # portable comment\n# POSIX shell comment\n");
  writeFileSync(join(repository, "cover.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  execFileSync("git", ["-C", repository, "init", "-q"]);
  execFileSync("git", ["-C", repository, "add", "--all"]);
  return repository;
}

export function checkCli(path, pkg = readPackage()) {
  withIsolatedFile(path, (isolatedPath, cwd) => {
    const run = (args) => execFileSync(process.execPath, [isolatedPath, ...args], { cwd, encoding: "utf8", timeout: 10000 });
    assert.equal(run(["--version"]), `${pkg.name} ${pkg.version}\n`);
    const help = run(["--help"]);
    for (const text of [pkg.name, "analyze", "--version", "--help", "--inventory", "--detail"]) assert.ok(help.includes(text), text);
    const repository = makeSmokeRepository(cwd);
    const analysis = spawnSync(process.execPath, [isolatedPath, "analyze", repository, "--detail", "summary"], { cwd, encoding: "utf8", timeout: 10000 });
    assert.equal(analysis.status, 0, analysis.stderr);
    const result = JSON.parse(analysis.stdout);
    assert.equal(result.schema_version, "miku-repo-scale.result/v1");
    assert.equal(result.tool.version, pkg.version);
    assert.equal(result.tool.ruleset_version, "1.4.0");
    assert.equal(result.status, "ok");
    assert.equal(result.summary.totals.total_physical_lines, 20);
    assert.equal(result.summary.coverage.binary_files, 1);
    assert.equal(result.summary.coverage.lexically_classified_files, 4);
    assert.equal(result.by_language.python.classified_lines.files, 1);
    assert.equal(result.by_language.java.classified_lines.files, 1);
    assert.equal(result.by_language.shell.classified_lines.files, 2);
    assert.equal(result.files, undefined, "summary detail omits file records");
  });
}

export function checkRuntime(path, pkg = readPackage()) {
  withIsolatedFile(path, (isolatedPath, cwd) => {
    const repository = makeSmokeRepository(cwd);
    const probe = "const m = await import(process.argv[1]); const r=typeof m.analyze==='function'?m.analyze({root:process.argv[2],detail:'summary'}):null; process.stdout.write(JSON.stringify({exports:Object.keys(m),metadata:m.metadata,status:r?.status??null,lines:r?.summary.totals.total_physical_lines??null}));";
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe, pathToFileURL(isolatedPath).href, repository],
      { cwd, encoding: "utf8", timeout: 10000 });
    assert.deepEqual(JSON.parse(output), {
      exports: ["analyze", "metadata"],
      metadata: { name: pkg.name, version: pkg.version, stage: "m1", analysisAvailable: true, rulesetVersion: "1.4.0" },
      status: "ok",
      lines: 20,
    });
  });
}

export function checkSources(path, projectRoot = root) {
  requireFile(path);
  const entries = execFileSync("tar", ["-tzf", path], { encoding: "utf8", timeout: 10000 }).trimEnd().split("\n");
  assert.deepEqual(entries, sourceFiles(projectRoot), "Source archive must contain exactly the curated source files");
  const archived = JSON.parse(execFileSync("tar", ["-xOf", path, "package.json"], { encoding: "utf8", timeout: 10000 }));
  assert.equal(archived.name, product);
  assert.equal(archived.version, readPackage(projectRoot).version);
}

export function stageRelease(tag, projectRoot = root) {
  const version = releaseVersion(tag, projectRoot);
  const inputs = artifactPaths(projectRoot);
  // Validate all inputs before replacing an existing staging directory.
  Object.values(inputs).forEach(requireFile);
  const outputs = artifactPaths(projectRoot, version);
  const directory = dirname(outputs.cli);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const key of Object.keys(inputs)) copyFileSync(inputs[key], outputs[key]);
  assert.deepEqual(readdirSync(directory).sort(), Object.values(outputs).map((path) => basename(path)).sort());
  return outputs;
}
