import { isBlankPhysicalLine, mapPhysicalLines } from "./physical-lines.mjs";

function normalizeCommentRanges(text, ranges) {
  if (!Array.isArray(ranges)) throw new TypeError("Comment ranges must be an array");
  const normalized = ranges.map((range, index) => {
    if (!range || typeof range !== "object" || Array.isArray(range)) {
      throw new TypeError(`Comment range ${index} must be an object`);
    }
    const { start, end } = range;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end || end > text.length) {
      throw new RangeError(`Comment range ${index} is outside the UTF-16 source text`);
    }
    return { start, end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].start < normalized[index - 1].end) {
      throw new RangeError("Comment ranges must not overlap");
    }
  }
  return normalized;
}

function hasNonBlankText(text, start, end) {
  return start < end && !isBlankPhysicalLine(text.slice(start, end));
}

/**
 * Classify original physical lines from non-overlapping half-open comment spans.
 * Offsets are UTF-16 code units, matching Node.js string indices.
 */
export function classifyLexicalLines(text, commentRanges) {
  if (typeof text !== "string") throw new TypeError("Source text must be a string");
  const ranges = normalizeCommentRanges(text, commentRanges);
  const physical = mapPhysicalLines(text);
  let blankLines = 0;
  let commentOnlyLines = 0;
  let codeLines = 0;
  let mixedCodeCommentLines = 0;
  let linesWithComments = 0;
  let firstPossibleRange = 0;

  for (const line of physical.lines) {
    const { start_offset: lineStart, content_end_offset: contentEnd } = line;
    if (isBlankPhysicalLine(text.slice(lineStart, contentEnd))) {
      blankLines += 1;
      continue;
    }

    while (firstPossibleRange < ranges.length && ranges[firstPossibleRange].end <= lineStart) {
      firstPossibleRange += 1;
    }

    let cursor = lineStart;
    let containsComment = false;
    let containsCode = false;
    for (let rangeIndex = firstPossibleRange;
      rangeIndex < ranges.length && ranges[rangeIndex].start < contentEnd;
      rangeIndex += 1) {
      const range = ranges[rangeIndex];
      const overlapStart = Math.max(lineStart, range.start);
      const overlapEnd = Math.min(contentEnd, range.end);
      if (overlapStart >= overlapEnd) continue;
      containsComment = true;
      if (hasNonBlankText(text, cursor, overlapStart)) containsCode = true;
      cursor = Math.max(cursor, overlapEnd);
    }
    if (hasNonBlankText(text, cursor, contentEnd)) containsCode = true;

    if (containsComment) linesWithComments += 1;
    if (containsComment && !containsCode) {
      commentOnlyLines += 1;
    } else {
      codeLines += 1;
      if (containsComment) mixedCodeCommentLines += 1;
    }
  }

  return {
    total_physical_lines: physical.total_physical_lines,
    blank_lines: blankLines,
    nonblank_lines: physical.nonblank_lines,
    comment_only_lines: commentOnlyLines,
    code_lines: codeLines,
    mixed_code_comment_lines: mixedCodeCommentLines,
    lines_with_comments: linesWithComments,
  };
}
