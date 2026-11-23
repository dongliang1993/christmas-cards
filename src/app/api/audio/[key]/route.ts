import { parseByteRange } from "@/lib/server/byteRange";
import { fail, toErrorResponse } from "@/lib/server/http";
import { contentTypeForKey, getUploadStore, isUploadKey } from "@/lib/server/uploadStore";

type Context = { params: Promise<{ key: string }> };

const NOT_FOUND = "找不到这个音频";

/**
 * Stream an uploaded song. Keys are random and immutable, so cache hard.
 *
 * Honours single-span Range requests: iOS will not play audio from a server
 * that answers its `bytes=0-1` probe with a 200, and an m4a whose index sits
 * at the end of the file needs a range to reach it. A ranged request reads
 * only that span from storage (a head for the size, then a ranged get).
 */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  try {
    const { key } = await params;
    if (!isUploadKey(key)) return fail(NOT_FOUND, 404);
    const store = await getUploadStore();
    const headers = {
      "content-type": contentTypeForKey(key),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "accept-ranges": "bytes",
    };

    const rangeHeader = request.headers.get("range");
    if (!rangeHeader) return wholeFile(await store.get(key), headers);

    const meta = await store.head(key);
    if (!meta) return fail(NOT_FOUND, 404);
    const range = parseByteRange(rangeHeader, meta.size);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${meta.size}` } });
    }
    if (!range) return wholeFile(await store.get(key), headers);

    const length = range.end - range.start + 1;
    const part = await store.get(key, { offset: range.start, length });
    if (!part) return fail(NOT_FOUND, 404);
    return new Response(part.body, {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${part.size}`, "content-length": String(length) },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/audio/:key");
  }
}

function wholeFile(file: { body: ArrayBuffer; size: number } | null, headers: Record<string, string>): Response {
  if (!file) return fail(NOT_FOUND, 404);
  return new Response(file.body, { headers: { ...headers, "content-length": String(file.size) } });
}
