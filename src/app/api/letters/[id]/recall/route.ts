import { z } from "zod";
import { getLetterRepository } from "@/lib/server/letterStore";
import { fail, ok, OUTBOX_ID_PATTERN, readJson, toErrorResponse } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ outboxId: z.string().regex(OUTBOX_ID_PATTERN, "无效的寄件箱") });

const REFUSALS = {
  "not-found": ["找不到这封信", 404],
  forbidden: ["只能撤回自己寄出的信", 403],
  "already-delivered": ["这封信已经送达，不能撤回", 409],
  opened: ["这封信已经被拆开，不能撤回", 409],
} as const;

export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "请求参数不合法", 400);
    const result = await (await getLetterRepository()).recall(id, parsed.data.outboxId, new Date());
    if (!result.ok) {
      const [message, status] = REFUSALS[result.reason];
      return fail(message, status);
    }
    return ok({ id: result.letter.id, recalledAt: result.letter.recalledAt });
  } catch (error) {
    return toErrorResponse(error, "POST /api/letters/:id/recall");
  }
}
