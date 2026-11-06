import { releaseVersion, stageRelease } from "./artifacts.mjs";

const tag = process.env.TAG_NAME;
if (process.argv.length === 3 && process.argv[2] === "--validate-only") {
  console.log(`Validated release version: ${releaseVersion(tag)}`);
} else if (process.argv.length === 2) {
  console.log(`Staged release assets: ${Object.values(stageRelease(tag)).join(", ")}`);
} else {
  throw new Error("Usage: TAG_NAME=v<version> node scripts/stage-release-assets.mjs [--validate-only]");
}
