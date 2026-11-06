import { closeSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { CATEGORIES, ENCODINGS, ROLES, classifyPath, compileGlob, validateConfig } from "./classification.mjs";
import { assertResultInvariants, emptyAggregate, emptyCoverage, emptyInventory, makeErrorResult, RULESET_VERSION, SCHEMA_VERSION } from "./contracts.mjs";
import { currentIndexFingerprint, isInsideGitAdministration, loadInventory, resolveRepositoryRoot } from "./git-inventory.mjs";
import { countPhysicalLines } from "./physical-lines.mjs";
import { readBoundedRepositoryFile } from "./file-access.mjs";
import { classifyLexicalLines } from "./lexical-lines.mjs";
import { lexSource } from "./lexers/index.mjs";

const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024;
const PROGRAM_LANGUAGES = new Set(["java", "javascript", "typescript", "python", "shell"]);
const BINARY_SIGNATURES = [
  [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
  [Buffer.from([0xff, 0xd8, 0xff]), "jpeg"], [Buffer.from("GIF87a"), "gif"], [Buffer.from("GIF89a"), "gif"],
  [Buffer.from("%PDF-"), "pdf"], [Buffer.from([0x50, 0x4b, 0x03, 0x04]), "zip"], [Buffer.from([0x50, 0x4b, 0x05, 0x06]), "zip"],
  [Buffer.from([0x50, 0x4b, 0x07, 0x08]), "zip"], [Buffer.from([0x1f, 0x8b]), "gzip"], [Buffer.from([0x7f, 0x45, 0x4c, 0x46]), "elf"],
  [Buffer.from("MZ"), "pe"], [Buffer.from("ID3"), "mp3"], [Buffer.from("OggS"), "ogg"], [Buffer.from("SQLite format 3\0"), "sqlite"],
  [Buffer.from("RIFF"), "riff"],
];

function diagnostic(code, severity, path, details = {}) {
  return { code, severity, path, details };
}

function normalizeOptions(options = {}) {
  const inventory = options.inventory ?? "tracked";
  const detail = options.detail ?? "files";
  const encoding = options.encoding ?? null;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];
  if (!Array.isArray(include) || include.some((pattern) => typeof pattern !== "string")) throw new Error("include must be an array of glob strings");
  if (!Array.isArray(exclude) || exclude.some((pattern) => typeof pattern !== "string")) throw new Error("exclude must be an array of glob strings");
  if (!new Set(["tracked", "all"]).has(inventory)) throw new Error("inventory must be tracked or all");
  if (!new Set(["files", "summary"]).has(detail)) throw new Error("detail must be files or summary");
  if (encoding !== null && !ENCODINGS.includes(encoding)) throw new Error("encoding must be utf-8, utf-16le, or utf-16be");
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) throw new Error("maxFileBytes must be a positive safe integer");
  for (const pattern of [...include, ...exclude]) compileGlob(pattern);
  return {
    inventory, detail, encoding, maxFileBytes,
    include: [...include].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))),
    exclude: [...exclude].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))),
  };
}

function loadConfig(configOption) {
  if (configOption === undefined || configOption === null) return { rules: [], normalized: { schema_version: "miku-repo-scale.config/v1", rules: [] } };
  let config;
  if (typeof configOption === "string") {
    let bytes;
    try { bytes = readFileSync(configOption); } catch { throw new Error("Unable to read the config file"); }
    try { config = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new Error("Config file must be valid UTF-8 JSON"); }
  } else config = configOption;
  const rules = validateConfig(config);
  const normalized = {
    schema_version: "miku-repo-scale.config/v1",
    rules: rules.map((rule) => Object.fromEntries([
      ["match", rule.match], ["category", rule.category], ["role", rule.role], ["language", rule.language], ["encoding", rule.encoding],
    ].filter(([, value]) => value !== undefined))),
  };
  return { rules, normalized };
}

function pathIsIncluded(path, includeMatchers, excludeMatchers) {
  const included = includeMatchers.length === 0 || includeMatchers.some((matcher) => matcher.test(path));
  return included && !excludeMatchers.some((matcher) => matcher.test(path));
}

function detectBom(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "utf-8", kind: "utf8", offset: 3 };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "utf-16le", kind: "utf16le", offset: 2 };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "utf-16be", kind: "utf16be", offset: 2 };
  return null;
}

function binarySignature(bytes) {
  for (const [signature, type] of BINARY_SIGNATURES) if (bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature)) return type;
  return null;
}

function decodeBytes(bytes, requestedEncoding) {
  const signature = binarySignature(bytes);
  if (signature) return { binary: signature };
  const bom = detectBom(bytes);
  if (requestedEncoding && bom && requestedEncoding !== bom.encoding) return { error: "ENCODING_BOM_MISMATCH" };
  const encoding = requestedEncoding ?? bom?.encoding ?? "utf-8";
  if ((!bom || bom.encoding === "utf-8") && bytes.includes(0) && encoding !== "utf-16le" && encoding !== "utf-16be") return { binary: "nul_byte" };
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    return { text, encoding };
  } catch {
    return { error: "TEXT_DECODE_ERROR", encoding };
  }
}

function emptyMetrics() {
  return {
    bytes: null, observed_bytes: null,
    total_physical_lines: null, blank_lines: null, nonblank_lines: null,
    comment_only_lines: null, code_lines: null, mixed_code_comment_lines: null, lines_with_comments: null,
  };
}

function baseFile(entry, classification) {
  return {
    path: entry.path,
    ...(entry.path_bytes_base64 === undefined ? {} : { path_bytes_base64: entry.path_bytes_base64 }),
    name: entry.name,
    extension: entry.extension,
    size_bytes: entry.size_bytes,
    git: entry.git,
    kind: entry.kind,
    stages: entry.stages,
    language: classification.language,
    language_reason: classification.language_reason,
    role: classification.role,
    role_reason: classification.role_reason,
    category: classification.category,
    category_reason: classification.category_reason,
    measurement: "skipped",
    skip_reason: null,
    comment_analysis: "not_requested",
    metrics: emptyMetrics(),
  };
}

const CLASSIFIED_LINE_FIELDS = [
  "total_physical_lines", "blank_lines", "nonblank_lines", "comment_only_lines",
  "code_lines", "mixed_code_comment_lines", "lines_with_comments",
];

function addAggregate(aggregate, file) {
  aggregate.files += 1;
  if (file.metrics.bytes !== null) aggregate.bytes += file.metrics.bytes;
  if (file.metrics.total_physical_lines !== null) aggregate.total_physical_lines += file.metrics.total_physical_lines;
  if (file.metrics.blank_lines !== null) aggregate.blank_lines += file.metrics.blank_lines;
  if (file.metrics.nonblank_lines !== null) aggregate.nonblank_lines += file.metrics.nonblank_lines;
  if (file.measurement === "lexical") {
    aggregate.classified_lines ??= { files: 0, bytes: 0, ...Object.fromEntries(CLASSIFIED_LINE_FIELDS.map((field) => [field, 0])) };
    aggregate.classified_lines.files += 1;
    aggregate.classified_lines.bytes += file.metrics.bytes;
    for (const field of CLASSIFIED_LINE_FIELDS) aggregate.classified_lines[field] += file.metrics[field];
  }
}

export function aggregateResults(files, diagnostics, inventoryEntries) {
  const totals = emptyAggregate();
  const byCategory = Object.fromEntries(CATEGORIES.map((key) => [key, emptyAggregate()]));
  const byRole = Object.fromEntries(ROLES.map((key) => [key, emptyAggregate()]));
  const byLanguage = {};
  const byExtension = {};
  const sourceComposition = {};
  const coverage = emptyCoverage();
  const inventory = emptyInventory();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const entry = inventoryEntries[index];
    if (!file.git.tracked) {
      inventory.metadata_only_entries += 1;
      if (file.git.ignore.would_ignore === true) inventory.ignored_metadata_only_entries += 1;
      continue;
    }
    inventory.tracked_entries += 1;
    if (file.measurement === "excluded") {
      inventory.excluded_entries += 1;
      continue;
    }
    const kind = entry.index_kind ?? file.kind;
    inventory.included_entries[kind] = (inventory.included_entries[kind] ?? 0) + 1;
    if (kind !== "regular") continue;
    coverage.included_regular_files += 1;
    addAggregate(totals, file);
    for (const group of [byCategory[file.category], byRole[file.role]]) addAggregate(group, file);
    byLanguage[file.language] ??= emptyAggregate();
    addAggregate(byLanguage[file.language], file);
    byExtension[file.extension] ??= emptyAggregate();
    addAggregate(byExtension[file.extension], file);
    if (file.category === "source") {
      sourceComposition[file.role] ??= emptyAggregate();
      addAggregate(sourceComposition[file.role], file);
    }

    if (file.metrics.bytes !== null) coverage.bytes_measured_files += 1;
    if (file.measurement === "basic" || file.measurement === "lexical") {
      coverage.text_measured_files += 1;
      if (file.measurement === "lexical") coverage.lexically_classified_files += 1;
      else coverage.basic_only_files += 1;
    } else if (file.measurement === "binary") coverage.binary_files += 1;
    else coverage.unmeasured_files += 1;
  }

  const diagnosticCounts = { total: diagnostics.length, error: 0, warning: 0, info: 0 };
  for (const item of diagnostics) diagnosticCounts[item.severity] = (diagnosticCounts[item.severity] ?? 0) + 1;
  const status = diagnostics.some((item) => item.severity === "error") ? "partial" : "ok";
  return {
    status,
    summary: { inventory, totals, coverage, diagnostic_counts: diagnosticCounts },
    by_category: byCategory,
    by_language: Object.fromEntries(Object.keys(byLanguage).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map((key) => [key, byLanguage[key]])),
    by_extension: Object.fromEntries(Object.keys(byExtension).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map((key) => [key, byExtension[key]])),
    by_role: byRole,
    source_composition: Object.fromEntries(ROLES.filter((role) => sourceComposition[role]).map((role) => [role, sourceComposition[role]])),
  };
}

function buildInput(options, config) {
  return {
    content_source: "worktree",
    inventory: options.inventory,
    include: options.include,
    exclude: options.exclude,
    encoding: options.encoding,
    max_file_bytes: options.maxFileBytes,
    config: config.normalized,
  };
}

function processEntry(entry, root, rules, normalized, includeMatchers, excludeMatchers, diagnostics, fileSystemAdapter) {
  const path = entry.path;
  const classification = path === null
    ? { language: "unknown", language_reason: "invalid_path", role: "unknown", role_reason: "invalid_path", category: "other", category_reason: "invalid_path", encoding: null }
    : classifyPath(path, rules);
  const file = baseFile(entry, classification);
  const included = path === null || pathIsIncluded(path, includeMatchers, excludeMatchers);

  if (!included) {
    file.measurement = "excluded";
    file.skip_reason = "path_filter";
    return file;
  }
  if (entry.disk_problem) {
    file.measurement = "error";
    const details = entry.disk_problem === "UNMERGED_PATH" ? { stages: entry.stages }
      : entry.disk_problem === "PATH_ENCODING_UNSUPPORTED" ? { path_bytes_base64: entry.path_bytes_base64 } : {};
    diagnostics.push(diagnostic(entry.disk_problem, "error", path, details));
    return file;
  }
  if (entry.kind === "unresolved") {
    file.measurement = "error";
    diagnostics.push(diagnostic("UNRESOLVED_ENTRY", "error", path));
    return file;
  }
  if (entry.kind === "symlink") {
    file.skip_reason = "symlink";
    return file;
  }
  if (entry.kind === "gitlink") {
    file.skip_reason = "gitlink";
    return file;
  }
  if (!entry.git.tracked) {
    file.skip_reason = "untracked_metadata_only";
    return file;
  }

  const readResult = readBoundedRepositoryFile(root, path, normalized.maxFileBytes, entry.stat_fingerprint, fileSystemAdapter);
  if (readResult.error) {
    file.measurement = "error";
    diagnostics.push(diagnostic(readResult.error, "error", path, { operation: "read" }));
    return file;
  }
  if (readResult.tooLarge) {
    file.measurement = "skipped";
    file.skip_reason = "size_limit";
    file.metrics.observed_bytes = readResult.observedBytes;
    diagnostics.push(diagnostic("SIZE_LIMIT", "error", path, { max_file_bytes: normalized.maxFileBytes, observed_bytes: readResult.observedBytes }));
    return file;
  }

  if (readResult.changed) {
    file.measurement = "error";
    if (readResult.bytes) file.metrics.bytes = readResult.bytes.length;
    diagnostics.push(diagnostic("INPUT_CHANGED", "error", path));
    return file;
  }
  const bytes = readResult.bytes;
  const decoded = decodeBytes(bytes, classification.encoding ?? normalized.encoding);
  if (decoded.binary) {
    file.measurement = "binary";
    file.binary_type = decoded.binary;
    file.metrics.bytes = bytes.length;
    return file;
  }
  file.metrics.bytes = bytes.length;
  if (decoded.error) {
    file.measurement = "error";
    diagnostics.push(diagnostic(decoded.error, "error", path, decoded.encoding ? { encoding: decoded.encoding } : {}));
    return file;
  }
  const resolvedClassification = classifyPath(path, rules, decoded.text);
  Object.assign(file, {
    language: resolvedClassification.language,
    language_reason: resolvedClassification.language_reason,
    role: resolvedClassification.role,
    role_reason: resolvedClassification.role_reason,
    category: resolvedClassification.category,
    category_reason: resolvedClassification.category_reason,
  });
  if (resolvedClassification.shebang_issue) {
    diagnostics.push(diagnostic(resolvedClassification.shebang_issue, "warning", path));
  }
  const lines = countPhysicalLines(decoded.text);
  Object.assign(file.metrics, lines);
  file.measurement = "basic";
  if (PROGRAM_LANGUAGES.has(resolvedClassification.language)) {
    const lexical = lexSource({
      language: resolvedClassification.language,
      extension: file.extension ?? "",
      dialect: resolvedClassification.language_dialect,
      text: decoded.text,
    });
    if (lexical.status === "available") {
      const commentRanges = decoded.text.startsWith("#!")
        ? lexical.comment_ranges.filter((range) => range.start !== 0)
        : lexical.comment_ranges;
      try {
        const lexicalLines = classifyLexicalLines(decoded.text, commentRanges);
        Object.assign(file.metrics, lexicalLines);
        file.measurement = "lexical";
        file.comment_analysis = "available";
      } catch {
        file.comment_analysis = "error";
        diagnostics.push(diagnostic("LEXICAL_ERROR", "warning", path, { language: resolvedClassification.language, reason: "invalid_comment_ranges" }));
      }
    } else if (lexical.status === "unsupported") {
      file.comment_analysis = "unsupported";
      diagnostics.push(diagnostic("COMMENT_ANALYSIS_UNSUPPORTED", "warning", path, { language: resolvedClassification.language }));
    } else {
      file.comment_analysis = "error";
      diagnostics.push(diagnostic("LEXICAL_ERROR", "warning", path, { language: resolvedClassification.language, reason: lexical.reason }));
    }
  }
  return file;
}

function finalizeResult(metadata, files, diagnostics, inventoryEntries, normalized, input, detail) {
  const aggregates = aggregateResults(files, diagnostics, inventoryEntries);
  const result = {
    schema_version: SCHEMA_VERSION,
    tool: { name: metadata.name, version: metadata.version, ruleset_version: RULESET_VERSION },
    status: aggregates.status,
    detail,
    input,
    summary: aggregates.summary,
    by_category: aggregates.by_category,
    by_language: aggregates.by_language,
    by_extension: aggregates.by_extension,
    by_role: aggregates.by_role,
    source_composition: aggregates.source_composition,
    files: detail === "summary" ? undefined : files,
    diagnostics: diagnostics.sort((left, right) => Buffer.compare(Buffer.from(left.path ?? ""), Buffer.from(right.path ?? ""))
      || (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)
      || Buffer.compare(Buffer.from(left.details?.path_bytes_base64 ?? ""), Buffer.from(right.details?.path_bytes_base64 ?? ""))),
  };
  if (result.files === undefined) delete result.files;
  return assertResultInvariants(result);
}

function analyzeUsingAdapter(options, fileSystemAdapter) {
  const metadata = options.metadata ?? { name: "miku-repo-scale", version: "0.0.0" };
  let normalized;
  let config;
  try {
    normalized = normalizeOptions(options);
    config = loadConfig(options.config);
  } catch (error) {
    return makeErrorResult(metadata, error.message, "INVALID_CONFIG_OR_OPTIONS", { detail: options.detail ?? "files" });
  }

  const input = buildInput(normalized, config);
  let root;
  let inventory;
  try {
    root = resolveRepositoryRoot(options.root);
    inventory = loadInventory(root, normalized.inventory);
  } catch (error) {
    const code = error.message.includes("subdirectory") ? "ROOT_NOT_REPOSITORY_ROOT" : error.message.includes("Bare") ? "BARE_REPOSITORY" : error.message.includes("working tree") ? "NOT_A_GIT_REPOSITORY" : error.message.includes("index") ? "GIT_INDEX_ERROR" : "INVALID_ROOT";
    return makeErrorResult(metadata, error.message, code, { input, detail: normalized.detail });
  }

  const diagnostics = [...inventory.diagnostics];
  const includeMatchers = normalized.include.map(compileGlob);
  const excludeMatchers = normalized.exclude.map(compileGlob);
  const files = inventory.entries.map((entry) => {
    return processEntry(entry, root, config.rules, normalized, includeMatchers, excludeMatchers, diagnostics, fileSystemAdapter);
  });

  const finalFingerprint = currentIndexFingerprint(root);
  if (finalFingerprint !== inventory.indexFingerprint) diagnostics.push(diagnostic("INPUT_CHANGED", "error", null, { source: "git_index" }));

  const result = finalizeResult(metadata, files, diagnostics, inventory.entries, normalized, input, normalized.detail);
  return result;
}

export function analyze(options = {}) {
  return analyzeUsingAdapter(options, undefined);
}

export function analyzeWithFilesystemAdapter(options = {}, fileSystemAdapter) {
  return analyzeUsingAdapter(options, fileSystemAdapter);
}

export function saveResult(result, outputPath, root, inventory) {
  const requestedTarget = resolve(outputPath);
  let target = requestedTarget;
  try { target = resolve(realpathSync(dirname(requestedTarget)), basename(requestedTarget)); }
  catch { /* File creation will return the structured parent-path error below. */ }
  if (isInsideGitAdministration(target, inventory.gitDir, inventory.commonDir)) throw new Error("Output cannot be written inside Git administrative data");
  const relativePath = relative(root, target);
  if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== "..") {
    const tracked = inventory.entries.some((entry) => entry.git.tracked && entry.path === relativePath.split(sep).join("/"));
    if (tracked) throw new Error("Output path belongs to a tracked repository entry");
  }
  const json = `${JSON.stringify(result, null, 2)}\n`;
  let descriptor;
  let created = false;
  try {
    descriptor = openSync(target, "wx");
    created = true;
    writeFileSync(descriptor, json);
    closeSync(descriptor);
    descriptor = undefined;
  } catch {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Continue cleanup after a failed close. */ }
    }
    if (created) {
      try { unlinkSync(target); }
      catch {
        const error = new Error("Output write failed and its incomplete file could not be removed");
        error.cleanupFailed = true;
        error.outputPath = target;
        throw error;
      }
    }
    throw new Error("Unable to create the output file; it must not already exist and its parent must be writable");
  }
  return json;
}

export function saveAnalysisResult(result, outputPath, requestedRoot) {
  const root = resolveRepositoryRoot(requestedRoot);
  const inventory = loadInventory(root, "tracked");
  return saveResult(result, outputPath, root, inventory);
}
