import { describe, expect, it } from "vitest";
import { createLettersApi } from "./lettersApi";
import { OUTBOX_STORAGE_KEY, readOutbox, rememberOutbox } from "./outboxStorage";
import { createInitialDraft, toLetterDraft } from "@/lib/editor/editorState";

function memory(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("outbox storage", () => {
  it("remembers a valid outbox id", () => {
    const s = memory();
    rememberOutbox(s, "abcdefghijklmnopqrstuvwx");
    expect(readOutbox(s)).toBe("abcdefghijklmnopqrstuvwx");
  });

  it("ignores a malformed stored value", () => {
    const s = memory();
    s.setItem(OUTBOX_STORAGE_KEY, "<script>");
    expect(readOutbox(s)).toBeNull();
  });
});

describe("lettersApi.send", () => {
  const draft = { ...toLetterDraft(createInitialDraft("first-snow")), recipientName: "小雪" };

  it("posts the draft with its delivery time and outbox", async () => {
    let sent: unknown = null;
    const api = createLettersApi(async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({ success: true, data: { id: "L1", outboxId: "O".repeat(24), deliverAt: "2026-12-23T16:00:00.000Z" } }, { status: 201 });
    });
    const res = await api.send(draft, "2026-12-23T16:00:00.000Z", null);
    expect(res.id).toBe("L1");
    expect(sent).toMatchObject({ recipientName: "小雪", deliverAt: "2026-12-23T16:00:00.000Z", outboxId: null });
  });

  it("surfaces the server's error message", async () => {
    const api = createLettersApi(async () => Response.json({ success: false, error: "请填写收件人" }, { status: 400 }));
    await expect(api.send(draft, "2026-12-23T16:00:00.000Z", null)).rejects.toThrow("请填写收件人");
  });

  it("explains a network failure in plain words", async () => {
    const api = createLettersApi(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(api.send(draft, "2026-12-23T16:00:00.000Z", null)).rejects.toThrow("网络");
  });
});
