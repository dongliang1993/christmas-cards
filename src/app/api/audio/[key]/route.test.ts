import { afterEach, describe, expect, it } from "vitest";
import { setUploadStoreForTests, type UploadStore } from "@/lib/server/uploadStore";
import { GET } from "./route";

const KEY = "abcdefghijklmnop.m4a";
const BYTES = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

/** Records the spans the route asked storage for, so we can see it never reads more. */
function storeWith(contentType: string, reads: Array<{ offset: number; length: number } | "whole"> = []): UploadStore {
  return {
    async put() {},
    async head(key) {
      return key === KEY ? { size: BYTES.byteLength } : null;
    },
    async get(key, range) {
      if (key !== KEY) return null;
      reads.push(range ?? "whole");
      const bytes = range ? BYTES.slice(range.offset, range.offset + range.length) : BYTES.slice();
      return { body: bytes.buffer as ArrayBuffer, contentType, size: BYTES.byteLength };
    },
  };
}

function get(headers: Record<string, string> = {}, key = KEY) {
  return GET(new Request(`http://x/api/audio/${key}`, { headers }), { params: Promise.resolve({ key }) });
}

afterEach(() => setUploadStoreForTests(null));

describe("GET /api/audio/:key", () => {
  it("serves the whole file with its length and advertises range support", async () => {
    setUploadStoreForTests(storeWith("audio/mp4"));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("answers a Range request with 206 and only those bytes (iOS needs this to play)", async () => {
    setUploadStoreForTests(storeWith("audio/mp4"));
    const res = await get({ range: "bytes=0-1" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1/100");
    expect(res.headers.get("content-length")).toBe("2");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0, 1]));
  });

  it("reads only the requested bytes from storage", async () => {
    const reads: Parameters<typeof storeWith>[1] = [];
    setUploadStoreForTests(storeWith("audio/mp4", reads));
    await get({ range: "bytes=10-19" });
    expect(reads).toEqual([{ offset: 10, length: 10 }]);
  });

  it("serves a suffix range from the end of the file", async () => {
    setUploadStoreForTests(storeWith("audio/mp4"));
    const res = await get({ range: "bytes=-3" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 97-99/100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([97, 98, 99]));
  });

  it("rejects a range past the end with 416", async () => {
    setUploadStoreForTests(storeWith("audio/mp4"));
    const res = await get({ range: "bytes=500-" });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
  });

  it("types the file by its extension, not by what the uploader's browser claimed", async () => {
    setUploadStoreForTests(storeWith("audio/x-m4a"));
    const res = await get();
    expect(res.headers.get("content-type")).toBe("audio/mp4");
  });

  it("404s an unknown key", async () => {
    setUploadStoreForTests(storeWith("audio/mp4"));
    expect((await get({}, "missingmissingmi.m4a")).status).toBe(404);
  });
});
