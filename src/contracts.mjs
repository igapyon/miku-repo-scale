import { CATEGORIES, ROLES } from "./classification.mjs";

export const RULESET_VERSION = "1.1.0";
export const SCHEMA_VERSION = "miku-repo-scale.result/v1";

export function emptyAggregate() {
  return {
    files: 0,
    bytes: 0,
    total_physical_lines: 0,
    blank_lines: 0,
    nonblank_lines: 0,
    classified_lines: null,
  };
}

export function emptyCoverage() {
  return {
    included_regular_files: 0,
    bytes_measured_files: 0,
    text_measured_files: 0,
    lexically_classified_files: 0,
    basic_only_files: 0,
    binary_files: 0,
    unmeasured_files: 0,
  };
}

export function emptyInventory() {
  return {
    tracked_entries: 0,
    excluded_entries: 0,
    included_entries: { regular: 0, symlink: 0, gitlink: 0, unresolved: 0 },
    metadata_only_entries: 0,
    ignored_metadata_only_entries: 0,
  };
}

export function makeErrorResult(metadata, message, code = "INVALID_INPUT", options = {}) {
  const diagnostic = { code, severity: "error", path: null, details: { message } };
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, emptyAggregate()]));
  const byRole = Object.fromEntries(ROLES.map((role) => [role, emptyAggregate()]));
  const detail = options.detail === "summary" ? "summary" : "files";
  const result = {
    schema_version: SCHEMA_VERSION,
    tool: { name: metadata.name, version: metadata.version, ruleset_version: RULESET_VERSION },
    status: "error",
    detail,
    input: options.input ?? null,
    summary: {
      inventory: emptyInventory(), totals: emptyAggregate(), coverage: emptyCoverage(),
      diagnostic_counts: { total: 1, error: 1, warning: 0, info: 0 },
    },
    by_category: byCategory,
    by_language: {}, by_extension: {}, by_role: byRole,
    source_composition: {}, diagnostics: [diagnostic],
  };
  if (detail === "files") result.files = [];
  return result;
}

export function stableJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function assertResultInvariants(result) {
  const fail = (name) => { throw new Error(`Result invariant violated: ${name}`); };
  const sum = (groups, key) => Object.values(groups).reduce((total, group) => total + group[key], 0);
  const classifiedFields = [
    "total_physical_lines", "blank_lines", "nonblank_lines", "comment_only_lines",
    "code_lines", "mixed_code_comment_lines", "lines_with_comments",
  ];
  const totals = result.summary.totals;
  const inventory = result.summary.inventory;
  const coverage = result.summary.coverage;
  if (result.schema_version !== SCHEMA_VERSION) fail("schema_version");
  if (!["ok", "partial", "error"].includes(result.status)) fail("status");
  if (inventory.tracked_entries !== inventory.excluded_entries + Object.values(inventory.included_entries).reduce((total, count) => total + count, 0)) fail("tracked inventory partition");
  if (inventory.ignored_metadata_only_entries > inventory.metadata_only_entries) fail("metadata-only ignore count");
  if (coverage.included_regular_files !== inventory.included_entries.regular) fail("regular file coverage");
  if (coverage.lexically_classified_files + coverage.basic_only_files !== coverage.text_measured_files) fail("text coverage partition");
  if (coverage.text_measured_files + coverage.binary_files + coverage.unmeasured_files !== coverage.included_regular_files) fail("measurement coverage partition");
  if (coverage.bytes_measured_files > coverage.included_regular_files) fail("byte coverage bound");
  if (totals.files !== coverage.included_regular_files) fail("aggregate file count");
  if (totals.nonblank_lines !== totals.total_physical_lines - totals.blank_lines) fail("aggregate line counts");
  if (totals.blank_lines > totals.total_physical_lines || totals.bytes < 0) fail("aggregate bounds");
  const diagnosticCounts = result.summary.diagnostic_counts;
  if (diagnosticCounts.total !== diagnosticCounts.error + diagnosticCounts.warning + diagnosticCounts.info) fail("diagnostic counts");
  if (result.diagnostics && result.diagnostics.length !== diagnosticCounts.total) fail("diagnostic list count");
  if (result.status === "ok" && diagnosticCounts.error > 0) fail("ok result has errors");
  for (const groups of [result.by_category, result.by_language, result.by_extension, result.by_role]) {
    for (const key of ["files", "bytes", "total_physical_lines", "blank_lines", "nonblank_lines"]) {
      if (sum(groups, key) !== totals[key]) fail(`group sum ${key}`);
    }
  }
  const aggregates = [totals, ...Object.values(result.by_category), ...Object.values(result.by_language),
    ...Object.values(result.by_extension), ...Object.values(result.by_role), ...Object.values(result.source_composition)];
  for (const aggregate of aggregates) {
    const classified = aggregate.classified_lines;
    if (classified === null) continue;
    if (!classified || typeof classified !== "object" || Array.isArray(classified)) fail("classified aggregate type");
    for (const key of ["files", "bytes", ...classifiedFields]) {
      if (!Number.isSafeInteger(classified[key]) || classified[key] < 0) fail(`classified aggregate ${key}`);
    }
    if (classified.files === 0 || classified.files > aggregate.files || classified.bytes > aggregate.bytes) fail("classified aggregate bounds");
    if (classified.total_physical_lines !== classified.blank_lines + classified.comment_only_lines + classified.code_lines) fail("classified total partition");
    if (classified.nonblank_lines !== classified.comment_only_lines + classified.code_lines) fail("classified nonblank partition");
    if (classified.lines_with_comments !== classified.comment_only_lines + classified.mixed_code_comment_lines) fail("classified comment partition");
    if (classified.mixed_code_comment_lines > classified.code_lines) fail("classified mixed bound");
  }
  if (coverage.lexically_classified_files === 0 && totals.classified_lines !== null) fail("unmeasured classified lines");
  if (coverage.lexically_classified_files > 0
      && (!totals.classified_lines || totals.classified_lines.files !== coverage.lexically_classified_files)) fail("classified coverage count");
  const fileIdentities = new Set();
  const lexicalSums = { files: 0, bytes: 0, ...Object.fromEntries(classifiedFields.map((field) => [field, 0])) };
  for (const file of result.files ?? []) {
    const identity = file.path === null ? `bytes:${file.path_bytes_base64 ?? ""}` : `path:${file.path}`;
    if (file.path === null && typeof file.path_bytes_base64 !== "string") fail("invalid path identity");
    if (file.path !== null && file.path_bytes_base64 !== undefined) fail("valid path has invalid byte identity");
    if (fileIdentities.has(identity)) fail("duplicate file path identity");
    fileIdentities.add(identity);
    const metrics = file.metrics;
    if (file.measurement === "basic" || file.measurement === "lexical") {
      if (metrics.bytes === null || metrics.total_physical_lines === null || metrics.blank_lines === null || metrics.nonblank_lines !== metrics.total_physical_lines - metrics.blank_lines) fail(`text file metrics ${file.path}`);
    } else if (file.measurement === "binary") {
      if (metrics.bytes === null || metrics.total_physical_lines !== null || metrics.blank_lines !== null || metrics.nonblank_lines !== null) fail(`binary file metrics ${file.path}`);
    } else if (file.measurement === "excluded" || file.measurement === "skipped") {
      if (metrics.bytes !== null || metrics.total_physical_lines !== null || metrics.blank_lines !== null || metrics.nonblank_lines !== null) fail(`skipped file metrics ${file.path}`);
    }
    if (file.measurement === "lexical") {
      if (file.comment_analysis !== "available") fail(`lexical comment state ${file.path}`);
      for (const key of ["comment_only_lines", "code_lines", "mixed_code_comment_lines", "lines_with_comments"]) {
        if (!Number.isSafeInteger(metrics[key]) || metrics[key] < 0) fail(`lexical metric ${key} ${file.path}`);
      }
      if (metrics.total_physical_lines !== metrics.blank_lines + metrics.comment_only_lines + metrics.code_lines) fail(`lexical total partition ${file.path}`);
      if (metrics.nonblank_lines !== metrics.comment_only_lines + metrics.code_lines) fail(`lexical nonblank partition ${file.path}`);
      if (metrics.lines_with_comments !== metrics.comment_only_lines + metrics.mixed_code_comment_lines) fail(`lexical comment partition ${file.path}`);
      if (metrics.mixed_code_comment_lines > metrics.code_lines) fail(`lexical mixed bound ${file.path}`);
      lexicalSums.files += 1;
      lexicalSums.bytes += metrics.bytes;
      for (const key of classifiedFields) lexicalSums[key] += metrics[key];
    } else {
      if (file.comment_analysis === "available") fail(`available comment state without lexical metrics ${file.path}`);
      for (const key of ["comment_only_lines", "code_lines", "mixed_code_comment_lines", "lines_with_comments"]) {
        if (metrics[key] !== null) fail(`unclassified lexical metric ${key} ${file.path}`);
      }
    }
  }
  if (result.files && lexicalSums.files > 0) {
    if (!totals.classified_lines) fail("file classified aggregate missing");
    for (const key of ["files", "bytes", ...classifiedFields]) {
      if (totals.classified_lines[key] !== lexicalSums[key]) fail(`file classified aggregate sum ${key}`);
    }
  }
  return result;
}
