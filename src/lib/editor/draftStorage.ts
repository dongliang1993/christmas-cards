import { storedDraftSchema } from "@/lib/letter/schema";
import type { LetterDraft } from "@/lib/letter/model";
import { toLetterDraft, withEditorIds, type EditorDraft } from "./editorState";

export const DRAFT_STORAGE_KEY = "christmas-cards:draft";
const VERSION = 1;

/**
 * Keep the draft in progress across reloads (spec §4). Storage may be
 * unavailable (private mode, blocked site data): failures are swallowed
 * because losing a convenience must never break the editor.
 */
export function saveDraft(storage: Pick<Storage, "setItem">, draft: EditorDraft): void {
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ v: VERSION, draft: toLetterDraft(draft) }));
  } catch {
    /* storage full or blocked: the draft just won't survive a reload */
  }
}

export function loadDraft(storage: Pick<Storage, "getItem">): EditorDraft | null {
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || (parsed as { v?: unknown }).v !== VERSION) return null;
    const result = storedDraftSchema.safeParse((parsed as { draft?: unknown }).draft);
    return result.success ? withEditorIds(result.data as LetterDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
