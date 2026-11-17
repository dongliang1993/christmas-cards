import type { PublicLetter } from "./model";

export type ViewerStage = "transit" | "refetch" | "sealed" | "card" | "recalled";

/**
 * What the recipient sees (spec §5). `refetch`: the delivery time passed
 * while the page was open, so the content (withheld until then) must be
 * fetched again before the envelope can be opened.
 */
export function viewerStage(letter: PublicLetter, now: Date, sealBroken: boolean): ViewerStage {
  if (letter.status === "recalled") return "recalled";
  if (!letter.content) return new Date(letter.deliverAt).getTime() <= now.getTime() ? "refetch" : "transit";
  return sealBroken ? "card" : "sealed";
}

const KEY = (id: string) => `christmas-cards:opened:${id}`;

/** True the first time a letter is opened in this browser session. */
export function shouldRecordOpening(storage: Pick<Storage, "getItem" | "setItem">, id: string): boolean {
  try {
    if (storage.getItem(KEY(id))) return false;
    storage.setItem(KEY(id), "1");
    return true;
  } catch {
    return true; // the server keeps only the first opening anyway
  }
}
