export const OUTBOX_STORAGE_KEY = "christmas-cards:outbox";
const PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Keep the sender's outbox id on this device (spec §6); storage may be blocked. */
export function rememberOutbox(storage: Pick<Storage, "setItem">, outboxId: string): void {
  if (!PATTERN.test(outboxId)) return;
  try {
    storage.setItem(OUTBOX_STORAGE_KEY, outboxId);
  } catch {
    /* the outbox link on the sent page is the fallback */
  }
}

export function readOutbox(storage: Pick<Storage, "getItem">): string | null {
  try {
    const value = storage.getItem(OUTBOX_STORAGE_KEY);
    return value && PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}
