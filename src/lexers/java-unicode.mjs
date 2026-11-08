const HEX_DIGITS = /^[0-9a-fA-F]{4}$/u;

function addSegment(segments, segment) {
  const previous = segments.at(-1);
  if (segment.linear && previous?.linear
      && previous.translatedEnd === segment.translatedStart
      && previous.sourceEnd === segment.sourceStart) {
    previous.translatedEnd = segment.translatedEnd;
    previous.sourceEnd = segment.sourceEnd;
    return;
  }
  segments.push(segment);
}

function mapBoundary(segments, offset, translatedLength, sourceLength) {
  if (!Number.isInteger(offset) || offset < 0 || offset > translatedLength) return null;
  if (offset === 0) return 0;
  if (offset === translatedLength) return sourceLength;

  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const segment = segments[middle];
    if (offset < segment.translatedStart) high = middle - 1;
    else if (offset > segment.translatedEnd) low = middle + 1;
    else if (offset === segment.translatedStart) return segment.sourceStart;
    else if (offset === segment.translatedEnd) return segment.sourceEnd;
    else if (segment.linear) return segment.sourceStart + offset - segment.translatedStart;
    else return null;
  }
  return null;
}

/** Translate JLS §3.3 Unicode escapes and retain a compact UTF-16 source map. */
export function translateJavaUnicodeEscapes(source) {
  const segments = [];
  const chunks = [];
  let translatedLength = 0;
  let trailingBackslashes = 0;
  let lastWasUnicodeEscape = false;

  const appendRaw = (start, end) => {
    if (start === end) return;
    const value = source.slice(start, end);
    chunks.push(value);
    addSegment(segments, {
      translatedStart: translatedLength,
      translatedEnd: translatedLength + value.length,
      sourceStart: start,
      sourceEnd: end,
      linear: true,
    });
    translatedLength += value.length;
    trailingBackslashes = 0;
    lastWasUnicodeEscape = false;
  };

  const appendRawBackslash = (offset) => {
    chunks.push("\\");
    addSegment(segments, {
      translatedStart: translatedLength,
      translatedEnd: translatedLength + 1,
      sourceStart: offset,
      sourceEnd: offset + 1,
      linear: true,
    });
    translatedLength += 1;
    trailingBackslashes += 1;
    lastWasUnicodeEscape = false;
  };

  const appendEscape = (value, start, end) => {
    chunks.push(value);
    addSegment(segments, {
      translatedStart: translatedLength,
      translatedEnd: translatedLength + 1,
      sourceStart: start,
      sourceEnd: end,
      linear: false,
    });
    translatedLength += 1;
    trailingBackslashes = value === "\\" ? trailingBackslashes + 1 : 0;
    lastWasUnicodeEscape = true;
  };

  let cursor = 0;
  while (cursor < source.length) {
    const slash = source.indexOf("\\", cursor);
    if (slash === -1) {
      appendRaw(cursor, source.length);
      break;
    }
    appendRaw(cursor, slash);

    const eligible = lastWasUnicodeEscape || trailingBackslashes % 2 === 0;
    if (!eligible || source[slash + 1] !== "u") {
      appendRawBackslash(slash);
      cursor = slash + 1;
      continue;
    }

    let digitsStart = slash + 1;
    while (source[digitsStart] === "u") digitsStart += 1;
    const digits = source.slice(digitsStart, digitsStart + 4);
    if (digits.length !== 4 || !HEX_DIGITS.test(digits)) {
      return { status: "error", reason: "unicode_escape" };
    }

    appendEscape(String.fromCharCode(Number.parseInt(digits, 16)), slash, digitsStart + 4);
    cursor = digitsStart + 4;
  }

  const text = chunks.join("");
  const mapRange = (start, end) => {
    const sourceStart = mapBoundary(segments, start, translatedLength, source.length);
    const sourceEnd = mapBoundary(segments, end, translatedLength, source.length);
    if (sourceStart === null || sourceEnd === null || sourceEnd < sourceStart) return null;
    return { start: sourceStart, end: sourceEnd };
  };

  return { status: "available", text, mapRange };
}
