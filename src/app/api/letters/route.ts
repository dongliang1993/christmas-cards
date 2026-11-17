import { sendLetterSchema } from "@/lib/letter/schema";
import { getLetterRepository } from "@/lib/server/letterStore";
import { fail, ok, readJson, toErrorResponse } from "@/lib/server/http";

/** Furthest ahead a letter may be scheduled. */
const MAX_DELAY_MS = 366 * 86_400_000;

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = sendLetterSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "请求参数不合法", 400);
    }
    const { deliverAt, outboxId, ...draft } = parsed.data;
    const now = new Date();
    if (new Date(deliverAt).getTime() - now.getTime() > MAX_DELAY_MS) {
      return fail("送达时间最多只能设在一年以内", 400);
    }
    const repo = await getLetterRepository();
    const letter = await repo.create({ ...draft, deliverAt }, outboxId ?? null, now);
    return ok({ id: letter.id, outboxId: letter.outboxId, deliverAt: letter.deliverAt }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/letters");
  }
}
