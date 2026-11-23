import { describe, expect, it } from "vitest";
import { parseByteRange } from "./byteRange";

describe("parseByteRange", () => {
  it("returns null when there is no Range header", () => {
    expect(parseByteRange(null, 100)).toBeNull();
  });

  it("parses a closed range (WebKit's first probe is bytes=0-1)", () => {
    expect(parseByteRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
  });

  it("parses an open-ended range up to the last byte", () => {
    expect(parseByteRange("bytes=40-", 100)).toEqual({ start: 40, end: 99 });
  });

  it("clamps an end past the file to the last byte", () => {
    expect(parseByteRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
  });

  it("parses a suffix range (the last N bytes, where a trailing moov lives)", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("marks a start beyond the file as unsatisfiable", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
  });

  it("ignores malformed or multi-part ranges and serves the whole file", () => {
    expect(parseByteRange("bytes=abc", 100)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
    expect(parseByteRange("bytes=5-2", 100)).toBeNull();
  });
});
