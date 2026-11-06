import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

function fingerprint(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

const nativeAdapter = {
  lstat: lstatSync,
  realpath: realpathSync,
  open: openSync,
  fstat: fstatSync,
  read: readSync,
  close: closeSync,
  checkpoint() {},
};

export function createFilesystemAccessAdapter(overrides = {}) {
  return Object.freeze({ ...nativeAdapter, ...overrides });
}

function insideRoot(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!isAbsolute(path) && !path.startsWith(`..${sep}`) && path !== "..");
}

function inspectPath(root, relativePath, adapter) {
  const canonicalRoot = adapter.realpath(root);
  if (canonicalRoot !== root) return { error: "INPUT_CHANGED" };
  const rootStat = adapter.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return { error: "INPUT_CHANGED" };

  const segments = relativePath.split("/");
  const parentStats = [];
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    parent = resolve(parent, segment);
    const stat = adapter.lstat(parent);
    if (stat.isSymbolicLink()) return { error: "PATH_PARENT_SYMLINK" };
    if (!stat.isDirectory()) return { error: "PATH_PARENT_NOT_DIRECTORY" };
    if (!insideRoot(root, adapter.realpath(parent))) return { error: "INPUT_CHANGED" };
    parentStats.push({ path: parent, fingerprint: fingerprint(stat) });
  }
  const target = resolve(parent, segments.at(-1));
  const stat = adapter.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) return { error: "FILE_TYPE_CHANGED" };
  return { target, stat, fingerprint: fingerprint(stat), parentStats };
}

function parentsStillMatch(root, parentStats, adapter) {
  const rootStat = adapter.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false;
  for (const item of parentStats) {
    let stat;
    try { stat = adapter.lstat(item.path); } catch { return false; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || fingerprint(stat) !== item.fingerprint) return false;
    try { if (!insideRoot(root, adapter.realpath(item.path))) return false; }
    catch { return false; }
  }
  return true;
}

export function readBoundedRepositoryFile(root, relativePath, limit, expectedFingerprint, adapter = nativeAdapter) {
  let descriptor;
  let snapshot;
  const context = { root, relativePath };
  try {
    snapshot = inspectPath(root, relativePath, adapter);
    if (snapshot.error) return { error: snapshot.error };
    if (expectedFingerprint && snapshot.fingerprint !== expectedFingerprint) return { changed: true, bytes: null };
    adapter.checkpoint("after_parent_check", context);
    if (!parentsStillMatch(root, snapshot.parentStats, adapter)) return { changed: true, bytes: null };
    const currentTarget = adapter.lstat(snapshot.target);
    if (!currentTarget.isFile() || currentTarget.isSymbolicLink() || fingerprint(currentTarget) !== snapshot.fingerprint) return { changed: true, bytes: null };
    adapter.checkpoint("before_open", context);

    descriptor = adapter.open(snapshot.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = adapter.fstat(descriptor);
    if (!before.isFile() || fingerprint(before) !== snapshot.fingerprint) return { changed: true, bytes: null };
    if (before.size > limit) return { tooLarge: true, observedBytes: before.size, before };

    adapter.checkpoint("after_open_before_read", context);
    if (!parentsStillMatch(root, snapshot.parentStats, adapter)) return { changed: true, bytes: null };
    const finalTarget = adapter.lstat(snapshot.target);
    if (!finalTarget.isFile() || finalTarget.isSymbolicLink() || fingerprint(finalTarget) !== fingerprint(before)) return { changed: true, bytes: null };

    const chunks = [];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let readBytes = 0;
    for (;;) {
      const count = adapter.read(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      readBytes += count;
      if (readBytes > limit) return { tooLarge: true, observedBytes: readBytes, before };
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const after = adapter.fstat(descriptor);
    if (fingerprint(before) !== fingerprint(after)) return { changed: true, bytes: Buffer.concat(chunks), before };
    return { bytes: Buffer.concat(chunks), before };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR" || error?.code === "ELOOP") return { changed: true, bytes: null };
    return { error: "FILE_READ_ERROR" };
  } finally {
    if (descriptor !== undefined) {
      try { adapter.close(descriptor); } catch { /* Preserve the read outcome. */ }
    }
  }
}
