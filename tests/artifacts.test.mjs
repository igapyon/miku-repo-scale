import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { artifactPaths, checkCli, checkRuntime, checkSources, readPackage, root, stageRelease } from "../scripts/artifacts.mjs";

const pkg = readPackage();

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "release fixture 日本語-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ["package.json", "package-lock.json"]) copyFileSync(join(root, name), join(directory, name));
  mkdirSync(join(directory, "bundle"));
  const inputs = artifactPaths();
  const outputs = artifactPaths(directory);
  for (const key of Object.keys(inputs)) copyFileSync(inputs[key], outputs[key]);
  mkdirSync(join(directory, "release-assets"));
  writeFileSync(join(directory, "release-assets/old.txt"), "stale asset");
  return directory;
}

test("source, dist and standalone CLI return the same measurement", () => {
  const entries = ["src/cli.mjs", "dist/cli.mjs", "bundle/miku-repo-scale.mjs"];
  for (const flag of ["--help", "--version"]) {
    const outputs = entries.map((entry) => execFileSync(process.execPath, [join(root, entry), flag], { encoding: "utf8" }));
    assert.equal(outputs[0], outputs[1]);
    assert.equal(outputs[0], outputs[2]);
  }
  const directory = mkdtempSync(join(tmpdir(), "miku-repo-scale parity-"));
  try {
    const repository = join(directory, "repository");
    mkdirSync(repository);
    writeFileSync(join(repository, "notes.txt"), "first\r\n\r\nlast");
    writeFileSync(join(repository, "records.jsonl"), '{"a":1}\n\nnot-json\n');
    execFileSync("git", ["-C", repository, "init", "-q"]);
    execFileSync("git", ["-C", repository, "add", "--all"]);
    const results = entries.map((entry) => spawnSync(process.execPath, [join(root, entry), "analyze", repository, "--detail", "summary"], { encoding: "utf8" }));
    for (const result of results) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(JSON.parse(result.stdout).status, "ok");
    }
    assert.equal(results[0].stdout, results[1].stdout);
    assert.equal(results[0].stdout, results[2].stdout);

    const partialRepository = join(directory, "partial repository");
    mkdirSync(partialRepository);
    writeFileSync(join(partialRepository, "bad.txt"), Buffer.from([0xff]));
    execFileSync("git", ["-C", partialRepository, "init", "-q"]);
    execFileSync("git", ["-C", partialRepository, "add", "--all"]);
    const partialResults = entries.map((entry) => spawnSync(process.execPath, [join(root, entry), "analyze", partialRepository, "--detail", "summary"], { encoding: "utf8" }));
    for (const result of partialResults) {
      assert.equal(result.status, 2);
      assert.equal(JSON.parse(result.stdout).status, "partial");
    }
    assert.equal(partialResults[0].stdout, partialResults[1].stdout);
    assert.equal(partialResults[0].stdout, partialResults[2].stdout);

    const invalidRoot = join(directory, "not a Git repository");
    mkdirSync(invalidRoot);
    const errorResults = entries.map((entry) => spawnSync(process.execPath, [join(root, entry), "analyze", invalidRoot], { encoding: "utf8" }));
    for (const result of errorResults) {
      assert.equal(result.status, 1);
      assert.equal(JSON.parse(result.stdout).status, "error");
    }
    assert.equal(errorResults[0].stdout, errorResults[1].stdout);
    assert.equal(errorResults[0].stdout, errorResults[2].stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI and runtime work from an isolated directory without source or node_modules", () => {
  checkCli(artifactPaths().cli);
  checkRuntime(artifactPaths().runtime);
});

test("--output saves the exact stdout bytes, refuses overwrite, tracked paths, and Git metadata", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "miku-repo-scale output-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repository = join(directory, "repository");
  mkdirSync(repository);
  writeFileSync(join(repository, "notes.txt"), "two lines\nsecond\n");
  execFileSync("git", ["-C", repository, "init", "-q"]);
  execFileSync("git", ["-C", repository, "add", "--all"]);
  const report = join(directory, "report.json");
  const cli = artifactPaths().cli;
  const first = spawnSync(process.execPath, [cli, "analyze", repository, "--detail", "summary", "--output", report], { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(Buffer.from(first.stdout), readFileSync(report));

  const overwrite = spawnSync(process.execPath, [cli, "analyze", repository, "--output", report], { encoding: "utf8" });
  assert.equal(overwrite.status, 1);
  assert.equal(JSON.parse(overwrite.stdout).status, "error");
  assert.deepEqual(Buffer.from(first.stdout), readFileSync(report), "an existing report must stay unchanged");

  for (const target of [join(repository, "notes.txt"), join(repository, ".git", "report.json")]) {
    const rejected = spawnSync(process.execPath, [cli, "analyze", repository, "--output", target], { encoding: "utf8" });
    assert.equal(rejected.status, 1, `Expected refusal for ${target}: ${rejected.stdout}`);
    assert.equal(JSON.parse(rejected.stdout).status, "error", `Expected structured error for ${target}`);
  }
});

test("staging replaces stale assets with exactly three unchanged, versioned files", (t) => {
  const directory = fixture(t);
  for (const tag of [`v${pkg.version}`, `v${pkg.version}.2`]) {
    const paths = stageRelease(tag, directory);
    assert.deepEqual(readdirSync(join(directory, "release-assets")).sort(), [
      `miku-repo-scale-${tag.slice(1)}.mjs`,
      `miku-repo-scale-runtime-${tag.slice(1)}.mjs`,
      `miku-repo-scale-sources-${tag.slice(1)}.tgz`,
    ].sort());
    for (const key of Object.keys(paths)) assert.deepEqual(readFileSync(paths[key]), readFileSync(artifactPaths(directory)[key]));
    checkCli(paths.cli, pkg);
    checkRuntime(paths.runtime, pkg);
  }
});

test("invalid or mismatched tags preserve existing staging", (t) => {
  const directory = fixture(t);
  for (const tag of [undefined, "v99.0.0", pkg.version, `v${pkg.version}.0`, `v${pkg.version}.notes`, `v${pkg.version}../escape`]) {
    assert.throws(() => stageRelease(tag, directory), /tag|TAG_NAME/i);
    assert.equal(readFileSync(join(directory, "release-assets/old.txt"), "utf8"), "stale asset");
  }
});

test("missing build outputs stop before staging is replaced", (t) => {
  const directory = fixture(t);
  rmSync(artifactPaths(directory).runtime);
  assert.throws(() => stageRelease(`v${pkg.version}`, directory), /ENOENT/);
  assert.ok(existsSync(join(directory, "release-assets/old.txt")));
});

test("a mismatched lockfile version stops release preparation", (t) => {
  const directory = fixture(t);
  const path = join(directory, "package-lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  lock.packages[""].version = "0.0.0";
  writeFileSync(path, JSON.stringify(lock));
  assert.throws(() => stageRelease(`v${pkg.version}`, directory), /lockfile root package/);
  assert.ok(existsSync(join(directory, "release-assets/old.txt")));
});

test("runtime smoke rejects artifacts with stale embedded metadata", (t) => {
  const directory = fixture(t);
  const paths = stageRelease(`v${pkg.version}`, directory);
  writeFileSync(paths.runtime, 'export const metadata = {name:"miku-repo-scale",version:"0.0.0"};\n');
  assert.throws(() => checkRuntime(paths.runtime, pkg), /0\.0\.0/);
});

test("source archive contains the curated build sources and licenses", () => {
  const paths = artifactPaths();
  checkSources(paths.sources);
  const entries = execFileSync("tar", ["-tzf", paths.sources], { encoding: "utf8" })
    .replace(/\r\n/gu, "\n").trimEnd().split("\n");
  for (const name of ["src/cli.mjs", "src/runtime.mjs", "scripts/build.mjs", "schemas/result-v1.schema.json", "schemas/config-v1.schema.json", "package-lock.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(entries.includes(name), name);
  }
  assert.ok(entries.every((name) => !/^(node_modules|workplace|dist|bundle|release-assets|\.git)\//.test(name)));
  assert.ok(entries.every((name) => basename(name) !== ".gitkeep"));
});
