/** Normalize shell line endings for tree-sitter while retaining UTF-16 offsets. */
export function normalizeShellSource(text) {
  const crlfNewlineOffsets = [];
  let collapsedPairs = 0;
  const normalized = text.replace(/\r\n?/gu, (ending, originalOffset) => {
    if (ending === "\r\n") {
      crlfNewlineOffsets.push(originalOffset - collapsedPairs);
      collapsedPairs += 1;
    }
    return "\n";
  });

  if (crlfNewlineOffsets.length === 0) {
    return { text: normalized, mapRange: (start, end) => ({ start, end }) };
  }

  function mapOffset(offset) {
    let low = 0;
    let high = crlfNewlineOffsets.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (crlfNewlineOffsets[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return offset + low;
  }

  return {
    text: normalized,
    mapRange: (start, end) => ({ start: mapOffset(start), end: mapOffset(end) }),
  };
}
