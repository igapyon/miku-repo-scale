import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { artifactPaths, checkCli, checkRuntime, checkSources, releaseVersion } from "./artifacts.mjs";

const mode = process.argv[2] ?? "all";
assert.ok(["cli", "runtime", "all", "release"].includes(mode), `Unknown check mode: ${mode}`);
const paths = artifactPaths(undefined, mode === "release" ? releaseVersion(process.env.TAG_NAME) : undefined);
if (["cli", "all", "release"].includes(mode)) checkCli(paths.cli);
if (["runtime", "all", "release"].includes(mode)) checkRuntime(paths.runtime);
if (["all", "release"].includes(mode)) checkSources(paths.sources);
if (mode === "release") {
  assert.deepEqual(readdirSync(dirname(paths.cli)).sort(), Object.values(paths).map((path) => basename(path)).sort());
}
console.log(`Artifact check (${mode}): ok`);
