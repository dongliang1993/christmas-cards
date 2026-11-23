/** An inclusive byte span of a file, as HTTP Range counts it. */
export interface ByteRange {
  start: number;
  end: number;
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Read a single-span `Range` header against a file of `size` bytes.
 *
 * WebKit (Safari, every iOS browser, WeChat on iPhone) asks for media in
 * ranges and refuses to play when the server ignores them. Anything we do
 * not understand (multi-part, other units, garbage) returns null, and the
 * caller serves the whole file, which RFC 9110 allows.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return null;
  const [, from, to] = match;
  if (from === "" && to === "") return null;

  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size) return "unsatisfiable";
  if (end < start) return null;
  return { start, end };
}
