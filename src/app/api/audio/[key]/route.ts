import { fail, toErrorResponse } from "@/lib/server/http";
import { getUploadStore, isUploadKey } from "@/lib/server/uploadStore";

type Context = { params: Promise<{ key: string }> };

/** Stream an uploaded song. Keys are random and immutable, so cache hard. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const { key } = await params;
    if (!isUploadKey(key)) return fail("找不到这个音频", 404);
    const file = await (await getUploadStore()).get(key);
    if (!file) return fail("找不到这个音频", 404);
    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/audio/:key");
  }
}
