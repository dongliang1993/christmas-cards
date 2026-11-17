import { letterStatus } from "@/lib/letter/delivery";
import { getLetterRepository } from "@/lib/server/letterStore";
import { fail, ok, OUTBOX_ID_PATTERN, toErrorResponse } from "@/lib/server/http";
import type { OutboxEntry } from "@/lib/letter/model";

type Context = { params: Promise<{ outboxId: string }> };

/** The sender's private list of letters and where each one is. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const { outboxId } = await params;
    if (!OUTBOX_ID_PATTERN.test(outboxId)) return fail("无效的寄件箱", 400);
    const now = new Date();
    const letters = await (await getLetterRepository()).listByOutbox(outboxId);
    const entries: OutboxEntry[] = letters.map((l) => ({
      id: l.id,
      recipientName: l.recipientName,
      createdAt: l.createdAt,
      deliverAt: l.deliverAt,
      openedAt: l.openedAt,
      status: letterStatus(l, now),
    }));
    return ok({ letters: entries });
  } catch (error) {
    return toErrorResponse(error, "GET /api/outbox/:outboxId");
  }
}
