import { fail, ok, toErrorResponse } from "@/lib/server/http";
import { getUploadStore, MAX_UPLOAD_BYTES, validateUpload } from "@/lib/server/uploadStore";

/** Audio for a letter (spec §10): validated, stored under a random key. */
export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return fail("音频不能超过 15 MB", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("请选择一个音频文件", 400);
    const check = validateUpload(file);
    if (!check.ok) return fail(check.error, 400);
    const store = await getUploadStore();
    await store.put(check.key, await file.arrayBuffer(), check.contentType);
    return ok({ url: `/api/audio/${check.key}`, filename: file.name });
  } catch (error) {
    return toErrorResponse(error, "POST /api/upload");
  }
}
