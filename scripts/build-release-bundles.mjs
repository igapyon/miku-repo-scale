import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { artifactPaths, checkCli, checkRuntime, root, sourceFiles } from "./artifacts.mjs";

checkCli(join(root, "dist/cli.mjs"));
checkRuntime(join(root, "dist/runtime.mjs"));
const sources = sourceFiles();
const files = artifactPaths();
rmSync(join(root, "bundle"), { recursive: true, force: true });
mkdirSync(join(root, "bundle"), { recursive: true });
copyFileSync(join(root, "dist/cli.mjs"), files.cli);
chmodSync(files.cli, 0o755);
copyFileSync(join(root, "dist/runtime.mjs"), files.runtime);
execFileSync("tar", ["-czf", files.sources, "--", ...sources], {
  cwd: root, stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" },
});
console.log(`Generated ${Object.values(files).join(", ")}`);
