import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";

function gitText(root, args) {
  const output = execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30000 });
  return stripGitLineEnding(output);
}

export function stripGitLineEnding(output, platform = process.platform) {
  if (platform === "win32" && output.endsWith("\r\n")) return output.slice(0, -2);
  return output.endsWith("\n") ? output.slice(0, -1) : output;
}

export function resolveRepositoryRoot(requestedRoot) {
  const probePath = resolve(requestedRoot ?? process.cwd());
  let stat;
  try { stat = lstatSync(probePath); } catch { throw new Error("Repository root does not exist"); }
  if (!stat.isDirectory()) throw new Error("Repository root must be a directory");

  let isBare;
  let gitRoot;
  try {
    isBare = gitText(probePath, ["rev-parse", "--is-bare-repository"]);
    if (isBare === "true") throw new Error("Bare Git repositories are not supported");
    gitRoot = realpathSync(gitText(probePath, ["rev-parse", "--show-toplevel"]));
  } catch (error) {
    if (error.message === "Bare Git repositories are not supported") throw error;
    throw new Error("Path is not inside a Git working tree");
  }

  // Let Git determine whether this directory is the worktree root. Comparing
  // canonical path strings can still misclassify the same Windows path when
  // its drive or component casing differs.
  if (requestedRoot !== undefined && gitText(probePath, ["rev-parse", "--show-prefix"]) !== "") {
    throw new Error("The supplied path is a subdirectory; provide the Git working-tree root");
  }
  return gitRoot;
}

function parseNul(buffer) {
  const fields = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) {
      fields.push(buffer.subarray(start, index));
      start = index + 1;
    }
  }
  if (start < buffer.length) fields.push(buffer.subarray(start));
  return fields;
}

export function parseLsFiles(buffer) {
  const grouped = new Map();
  for (const record of parseNul(buffer)) {
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new Error("Git returned a malformed ls-files record");
    const header = record.subarray(0, tab).toString("ascii").split(" ");
    if (header.length !== 3 || !/^\d{6}$/u.test(header[0]) || !/^\d+$/u.test(header[2])) throw new Error("Git returned a malformed ls-files header");
    const pathBytes = Buffer.from(record.subarray(tab + 1));
    const key = pathBytes.toString("hex");
    const entry = { mode: Number.parseInt(header[0], 8), object_id: header[1], stage: Number(header[2]) };
    const current = grouped.get(key) ?? { pathBytes, stages: [] };
    current.stages.push(entry);
    grouped.set(key, current);
  }
  return [...grouped.values()].map((value) => ({ ...value, stages: value.stages.sort((a, b) => a.stage - b.stage) }))
    .sort((a, b) => Buffer.compare(a.pathBytes, b.pathBytes));
}

function runLsFiles(root) {
  return execFileSync("git", ["-C", root, "ls-files", "--cached", "--stage", "-z"], {
    encoding: "buffer", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024, timeout: 60000,
  });
}

function toSlash(value) { return value.split(sep).join("/"); }

function scanFilesystem(root, trackedKeys) {
  const untracked = [];
  const diagnostics = [];
  function visit(directory, relativeDirectory) {
    let children;
    try { children = readdirSync(directory, { withFileTypes: true }); }
    catch {
      diagnostics.push({ code: "INVENTORY_READ_ERROR", severity: "error", path: relativeDirectory || null, details: { operation: "readdir" } });
      return;
    }
    children.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const child of children) {
      if (child.name === ".git") continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const absolutePath = resolve(directory, child.name);
      const pathBytes = Buffer.from(relativePath, "utf8");
      const key = pathBytes.toString("hex");
      if (trackedKeys.has(key)) continue;
      let stat;
      try { stat = lstatSync(absolutePath); }
      catch {
        diagnostics.push({ code: "INVENTORY_STAT_ERROR", severity: "error", path: relativePath, details: { operation: "lstat" } });
        continue;
      }
      if (stat.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      untracked.push({ pathBytes, stages: [], stat, absolutePath, diskKind: stat.isFile() ? "regular" : stat.isSymbolicLink() ? "symlink" : "unresolved" });
    }
  }
  visit(root, "");
  untracked.sort((a, b) => Buffer.compare(a.pathBytes, b.pathBytes));
  return { untracked, diagnostics };
}

function ignoreSource(value, root) {
  if (!value) return null;
  const source = value.toString("utf8");
  const slashSource = source.replaceAll("\\", "/");
  if (/(^|\/)info\/exclude$/u.test(slashSource)) return { source_kind: "info_exclude", source: ".git/info/exclude" };
  if (isAbsolute(source)) {
    const rel = relative(root, source);
    if (rel && !rel.startsWith(`..${sep}`) && rel !== "..") {
      const normalized = toSlash(rel);
      if (normalized.slice(normalized.lastIndexOf("/") + 1) === ".gitignore") {
        return { source_kind: normalized.includes("/") ? "nested_gitignore" : "root_gitignore", source: normalized };
      }
    }
    return { source_kind: "global", source: null };
  }
  const normalized = slashSource.replace(/^\.\//u, "");
  if (normalized.endsWith(".gitignore")) {
    return { source_kind: normalized.includes("/") ? "nested_gitignore" : "root_gitignore", source: normalized };
  }
  return { source_kind: "global", source: null };
}

function readIgnoreRules(root, entries) {
  if (entries.length === 0) return { rules: new Map(), diagnostics: [] };
  // A leading ./ prevents a filename beginning with :(...) from being parsed as pathspec magic.
  const input = Buffer.concat(entries.flatMap((entry) => [Buffer.from("./"), entry.pathBytes, Buffer.from([0])]));
  const result = spawnSync("git", ["-C", root, "check-ignore", "--no-index", "--verbose", "--non-matching", "-z", "--stdin"], {
    input, encoding: "buffer", maxBuffer: 256 * 1024 * 1024, timeout: 60000,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    return {
      rules: new Map(),
      diagnostics: [{ code: "IGNORE_CHECK_ERROR", severity: "error", path: null, details: { operation: "git_check_ignore" } }],
    };
  }
  const fields = parseNul(result.stdout ?? Buffer.alloc(0));
  const rules = new Map();
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [sourceBytes, lineBytes, patternBytes, reportedPathBytes] = fields.slice(index, index + 4);
    const pathBytes = reportedPathBytes.length >= 2 && reportedPathBytes[0] === 0x2e && reportedPathBytes[1] === 0x2f
      ? reportedPathBytes.subarray(2) : reportedPathBytes;
    const key = pathBytes.toString("hex");
    let rule = null;
    if (sourceBytes.length && lineBytes.length) {
      rule = {
        ...ignoreSource(sourceBytes, root),
        line: Number(lineBytes.toString("ascii")),
        pattern: patternBytes.toString("utf8"),
      };
    }
    rules.set(key, rule);
  }
  const incomplete = fields.length % 4 !== 0 || entries.some((entry) => !rules.has(entry.pathBytes.toString("hex")));
  return {
    rules,
    diagnostics: incomplete ? [{ code: "IGNORE_CHECK_INCOMPLETE", severity: "error", path: null, details: { operation: "git_check_ignore" } }] : [],
  };
}

function decodePath(pathBytes) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(pathBytes); }
  catch { return null; }
}

export function makeInventoryEntry(root, rawEntry, ignoreRule, tracked) {
  const path = decodePath(rawEntry.pathBytes);
  const name = path === null ? null : path.slice(path.lastIndexOf("/") + 1);
  const pathStat = rawEntry.stat ?? null;
  const indexModes = rawEntry.stages.map((stage) => stage.mode);
  const indexKind = tracked
    ? rawEntry.stages.some((stage) => stage.stage !== 0) ? "unresolved"
      : indexModes[0] === 0o160000 ? "gitlink"
        : indexModes[0] === 0o120000 ? "symlink"
          : indexModes[0] === 0o100644 || indexModes[0] === 0o100755 ? "regular" : "unresolved"
    : rawEntry.diskKind;
  let kind = indexKind;
  let stat = pathStat;
  let diskProblem = tracked && rawEntry.stages.some((stage) => stage.stage !== 0) ? "UNMERGED_PATH" : null;

  if (!diskProblem && tracked && rawEntry.stages.every((stage) => stage.stage === 0) && path !== null && indexKind !== "gitlink") {
    const segments = path.split("/");
    let current = root;
    try {
      for (let index = 0; index < segments.length - 1; index += 1) {
        current = resolve(current, segments[index]);
        const parentStat = lstatSync(current);
        if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
          diskProblem = parentStat.isSymbolicLink() ? "PATH_PARENT_SYMLINK" : "PATH_PARENT_NOT_DIRECTORY";
          break;
        }
      }
      if (!diskProblem) {
        const absolute = resolve(root, ...segments);
        stat = lstatSync(absolute);
        if (kind === "regular" && !stat.isFile()) {
          diskProblem = stat.isSymbolicLink() ? "FILE_TYPE_MISMATCH" : "FILE_TYPE_UNSUPPORTED";
          kind = "unresolved";
        } else if (kind === "symlink" && !stat.isSymbolicLink()) {
          diskProblem = "FILE_TYPE_MISMATCH";
          kind = "unresolved";
        }
      }
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") diskProblem = "FILE_MISSING";
      else diskProblem = "FILE_STAT_ERROR";
      kind = "unresolved";
      stat = null;
    }
  }

  if (path === null) {
    kind = "unresolved";
    diskProblem = "PATH_ENCODING_UNSUPPORTED";
  }

  return {
    path, path_bytes_base64: path === null ? rawEntry.pathBytes.toString("base64") : undefined,
    name, extension: name === null ? null : extensionOfName(name),
    size_bytes: stat?.isFile() ? stat.size : null,
    stat_fingerprint: stat?.isFile() ? [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":") : null,
    git: { tracked, ignore: { would_ignore: ignoreRule === undefined ? null : ignoreRule !== null && !ignoreRule.pattern.startsWith("!"), rule: ignoreRule ?? null } },
    kind, index_kind: indexKind, stages: tracked ? rawEntry.stages.map((stage) => stage.stage) : [],
    disk_problem: diskProblem,
    absolute_path: path === null ? null : resolve(root, ...path.split("/")),
  };
}

function extensionOfName(name) {
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}

export function loadInventory(root, inventoryMode = "tracked") {
  let tracked;
  try { tracked = parseLsFiles(runLsFiles(root)); }
  catch { throw new Error("Unable to read the Git index"); }
  const allEntries = [...tracked.map((entry) => ({ ...entry, isTracked: true }))];
  const diagnostics = [];

  if (inventoryMode === "all") {
    const scan = scanFilesystem(root, new Set(tracked.map((entry) => entry.pathBytes.toString("hex"))));
    diagnostics.push(...scan.diagnostics);
    allEntries.push(...scan.untracked.map((entry) => ({ ...entry, isTracked: false })));
  }
  allEntries.sort((a, b) => Buffer.compare(a.pathBytes, b.pathBytes));
  const ignore = readIgnoreRules(root, allEntries);
  diagnostics.push(...ignore.diagnostics);
  const entries = allEntries.map((entry) => makeInventoryEntry(root, entry, ignore.rules.get(entry.pathBytes.toString("hex")), entry.isTracked));
  const gitDir = realpathSync(gitText(root, ["rev-parse", "--absolute-git-dir"]));
  const commonDirText = gitText(root, ["rev-parse", "--git-common-dir"]);
  const commonDir = realpathSync(resolve(root, commonDirText));
  return { entries, diagnostics, gitDir, commonDir, indexFingerprint: tracked.map((entry) => `${entry.pathBytes.toString("hex")}:${entry.stages.map((stage) => `${stage.mode}/${stage.object_id}/${stage.stage}`).join(",")}`).join("\n") };
}

export function currentIndexFingerprint(root) {
  try {
    return parseLsFiles(runLsFiles(root)).map((entry) => `${entry.pathBytes.toString("hex")}:${entry.stages.map((stage) => `${stage.mode}/${stage.object_id}/${stage.stage}`).join(",")}`).join("\n");
  } catch { return null; }
}

function gitReportsInsideGitDirectory(path) {
  let directory = dirname(path);
  while (true) {
    try {
      const canonical = realpathSync(directory);
      if (statSync(canonical).isDirectory()) {
        directory = canonical;
        break;
      }
    } catch { /* Walk to the nearest existing parent. */ }
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }

  const result = spawnSync("git", ["-C", directory, "rev-parse", "--is-inside-git-dir"], {
    encoding: "buffer", stdio: ["ignore", "pipe", "ignore"], timeout: 10000,
  });
  return !result.error && result.status === 0 && stripGitLineEnding(result.stdout.toString("utf8")) === "true";
}

export function isInsideGitAdministration(path, gitDir, commonDir, platform = process.platform) {
  const pathApi = platform === "win32" ? win32 : { resolve };
  const normalized = pathApi.resolve(path);
  const comparisonPath = platform === "win32" ? normalized.toLowerCase() : normalized;
  const separator = platform === "win32" ? "\\" : sep;
  return [gitDir, commonDir].some((directory) => {
    const base = pathApi.resolve(directory);
    const comparisonBase = platform === "win32" ? base.toLowerCase() : base;
    return comparisonPath === comparisonBase || comparisonPath.startsWith(`${comparisonBase}${separator}`);
  }) || (platform === process.platform && gitReportsInsideGitDirectory(normalized));
}
