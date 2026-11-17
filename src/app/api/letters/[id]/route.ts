import { toPublicLetter } from "@/lib/letter/delivery";
import { getLetterRepository } from "@/lib/server/letterStore";
import { fail, ok, toErrorResponse } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const letter = await (await getLetterRepository()).findById(id);
    if (!letter) return fail("找不到这封信", 404);
    return ok(toPublicLetter(letter, new Date()));
  } catch (error) {
    return toErrorResponse(error, "GET /api/letters/:id");
  }
}
