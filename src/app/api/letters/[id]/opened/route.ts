import { toPublicLetter } from "@/lib/letter/delivery";
import { getLetterRepository } from "@/lib/server/letterStore";
import { fail, ok, toErrorResponse } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

const REFUSALS = {
  "not-found": ["找不到这封信", 404],
  "not-delivered": ["这封信还在路上", 409],
  recalled: ["这封信已被寄件人撤回", 410],
} as const;

/** The recipient broke the seal: record the first opening only. */
export async function POST(_request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const now = new Date();
    const result = await (await getLetterRepository()).markOpened(id, now);
    if (!result.ok) {
      const [message, status] = REFUSALS[result.reason];
      return fail(message, status);
    }
    return ok(toPublicLetter(result.letter, now));
  } catch (error) {
    return toErrorResponse(error, "POST /api/letters/:id/opened");
  }
}
