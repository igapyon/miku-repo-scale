import packageMetadata from "../package.json" with { type: "json" };
import { analyze as analyzeRepository } from "./analyze.mjs";
import { RULESET_VERSION } from "./contracts.mjs";

export const metadata = Object.freeze({
  name: packageMetadata.name,
  version: packageMetadata.version,
  stage: "m1",
  analysisAvailable: true,
  rulesetVersion: RULESET_VERSION,
});

export function analyze(options = {}) {
  return analyzeRepository({ ...options, metadata });
}
