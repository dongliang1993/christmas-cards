import type { ApiResponse } from "@/lib/types";
import type { LetterDraft, OutboxEntry, PublicLetter } from "@/lib/letter/model";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SentLetter {
  id: string;
  outboxId: string;
  deliverAt: string;
}

async function call<T>(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    throw new Error("网络连接失败，请检查网络后重试");
  }
  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !body?.success || body.data === undefined) {
    throw new Error(body?.error ?? `请求失败 (${res.status})`);
  }
  return body.data;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function createLettersApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
  return {
    send(draft: LetterDraft, deliverAt: string, outboxId: string | null): Promise<SentLetter> {
      return call(fetchImpl, "/api/letters", json({ ...draft, deliverAt, outboxId }));
    },
    getLetter(id: string): Promise<PublicLetter> {
      return call(fetchImpl, `/api/letters/${encodeURIComponent(id)}`);
    },
    markOpened(id: string): Promise<PublicLetter> {
      return call(fetchImpl, `/api/letters/${encodeURIComponent(id)}/opened`, { method: "POST" });
    },
    getOutbox(outboxId: string): Promise<{ letters: OutboxEntry[] }> {
      return call(fetchImpl, `/api/outbox/${encodeURIComponent(outboxId)}`);
    },
    recall(id: string, outboxId: string): Promise<{ id: string; recalledAt: string }> {
      return call(fetchImpl, `/api/letters/${encodeURIComponent(id)}/recall`, json({ outboxId }));
    },
  };
}

export const lettersApi = createLettersApi();
