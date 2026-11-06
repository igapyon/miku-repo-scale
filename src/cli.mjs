#!/usr/bin/env node
import { metadata } from "./runtime.mjs";
import { analyze, saveAnalysisResult } from "./analyze.mjs";
import { makeErrorResult, stableJson } from "./contracts.mjs";

const args = process.argv.slice(2);
if (args.length === 1 && ["--version", "-V"].includes(args[0])) {
  console.log(`${metadata.name} ${metadata.version}`);
} else if (args.length === 0 || (args.length === 1 && ["--help", "-h"].includes(args[0]))) {
  console.log(`${metadata.name} — repository scale analysis (M1)

Usage:
  ${metadata.name} analyze [repository-root] [options]
  ${metadata.name} --help
  ${metadata.name} --version

Options:
  --include <glob>       Include matching paths (repeatable)
  --exclude <glob>       Exclude matching paths (repeatable)
  --inventory <mode>     tracked (default) or all metadata
  --encoding <encoding>  utf-8, utf-16le, or utf-16be
  --max-file-bytes <n>   Per-file read limit (default 16777216)
  --config <file.json>   Explicit classification and encoding rules
  --detail <mode>        files (default) or summary
  --output <new-file>    Save the result JSON to a new file`);
} else {
  const parsed = parseAnalyzeArgs(args);
  let result;
  if (parsed.error) result = makeErrorResult(metadata, parsed.error, "INVALID_ARGUMENT", { detail: parsed.options.detail ?? "files" });
  else result = analyze({ ...parsed.options, metadata });

  try {
    const json = parsed.options.output && result.status !== "error"
      ? saveAnalysisResult(result, parsed.options.output, parsed.options.root)
      : stableJson(result);
    process.stdout.write(json);
    process.exitCode = result.status === "error" ? 1 : result.status === "partial" ? 2 : 0;
  } catch (error) {
    if (error.cleanupFailed) process.stderr.write(`Could not remove incomplete output: ${error.outputPath}\n`);
    const failed = makeErrorResult(metadata, error.message, "OUTPUT_WRITE_ERROR", { detail: parsed.options.detail ?? "files" });
    process.stdout.write(stableJson(failed));
    process.exitCode = 1;
  }
}

function parseAnalyzeArgs(values) {
  const options = { include: [], exclude: [] };
  if (values[0] !== "analyze") return { error: "Expected the analyze command", options };
  let index = 1;
  if (values[index] && !values[index].startsWith("-")) options.root = values[index++];
  const valueOptions = new Map([
    ["--include", "include"], ["--exclude", "exclude"], ["--inventory", "inventory"], ["--encoding", "encoding"],
    ["--config", "config"], ["--detail", "detail"], ["--output", "output"], ["--max-file-bytes", "maxFileBytes"],
  ]);
  while (index < values.length) {
    const flag = values[index++];
    const key = valueOptions.get(flag);
    if (!key) return { error: `Unknown option: ${flag}`, options };
    if (index >= values.length || values[index].startsWith("--")) return { error: `Missing value for ${flag}`, options };
    const value = values[index++];
    if (key === "include" || key === "exclude") options[key].push(value);
    else if (key === "maxFileBytes") {
      if (!/^\d+$/u.test(value)) return { error: "--max-file-bytes must be a positive integer", options };
      options[key] = Number(value);
    } else options[key] = value;
  }
  return { options };
}
