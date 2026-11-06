const BLANK_LINE = /^[\u0020\u0009\u000c\u000b]*$/u;

export function isBlankPhysicalLine(text) {
  return BLANK_LINE.test(text);
}

function scanPhysicalLines(text, collectOffsets) {
  let total = 0;
  let blank = 0;
  let start = 0;
  const lines = collectOffsets ? [] : undefined;

  function countLine(contentEnd, terminatorLength) {
    total += 1;
    if (isBlankPhysicalLine(text.slice(start, contentEnd))) blank += 1;
    if (lines) lines.push({
      start_offset: start,
      content_end_offset: contentEnd,
      terminator_start_offset: contentEnd,
      terminator_length: terminatorLength,
    });
  }

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code !== 0x0a && code !== 0x0d) continue;
    const terminatorLength = code === 0x0d && text.charCodeAt(index + 1) === 0x0a ? 2 : 1;
    countLine(index, terminatorLength);
    if (terminatorLength === 2) index += 1;
    start = index + 1;
  }

  if (start < text.length) countLine(text.length, 0);

  return {
    total_physical_lines: total,
    blank_lines: blank,
    nonblank_lines: total - blank,
    ...(lines === undefined ? {} : { lines }),
  };
}

/** Count source physical lines without creating a synthetic line after EOF. */
export function countPhysicalLines(text) {
  const { total_physical_lines, blank_lines, nonblank_lines } = scanPhysicalLines(text, false);
  return { total_physical_lines, blank_lines, nonblank_lines };
}

/** Return line spans measured in UTF-16 code units of the decoded source text. */
export function mapPhysicalLines(text) {
  return scanPhysicalLines(text, true);
}
