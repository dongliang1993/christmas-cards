import { describe, expect, it } from "vitest";
import { LIMITS, type CardElement, type Letter, type LetterDraft } from "./model";
import { letterDraftSchema, sendLetterSchema } from "./schema";
import { letterStatus, resolveDeliverAt, toPublicLetter } from "./delivery";

const CN_OFFSET = -480; // Date#getTimezoneOffset() in UTC+8

function sticker(face: CardElement["face"], i: number): CardElement {
  return { kind: "sticker", stickerId: "holly", face, x: 0.5, y: 0.5, scale: 1, rotation: 0, z: i };
}

function text(face: CardElement["face"], value = "Merry Christmas"): CardElement {
  return { kind: "text", text: value, font: "hand-en", ink: "black", face, x: 0.5, y: 0.4, scale: 1, rotation: 0, z: 0 };
}

function draft(over: Partial<LetterDraft> = {}): LetterDraft {
  return {
    templateId: "first-snow",
    paper: "cold-press",
    envelopeColor: "ivory",
    seal: { color: "red", stamp: "snowflake" },
    recipientName: "小雪",
    elements: [sticker("inside-left", 0), text("inside-right")],
    audioUrl: null,
    audioName: null,
    ...over,
  };
}

describe("letterDraftSchema", () => {
  it("accepts a well-formed draft", () => {
    expect(letterDraftSchema.safeParse(draft()).success).toBe(true);
  });

  it("rejects more than the sticker limit on one face", () => {
    const elements = Array.from({ length: LIMITS.stickersPerFace + 1 }, (_, i) => sticker("inside-left", i));
    expect(letterDraftSchema.safeParse(draft({ elements })).success).toBe(false);
  });

  it("allows the sticker limit on each face separately", () => {
    const elements = [
      ...Array.from({ length: LIMITS.stickersPerFace }, (_, i) => sticker("inside-left", i)),
      ...Array.from({ length: LIMITS.stickersPerFace }, (_, i) => sticker("inside-right", i)),
    ];
    expect(letterDraftSchema.safeParse(draft({ elements })).success).toBe(true);
  });

  it("rejects more than the text limit on one face", () => {
    const elements = Array.from({ length: LIMITS.textsPerFace + 1 }, () => text("inside-right"));
    expect(letterDraftSchema.safeParse(draft({ elements })).success).toBe(false);
  });

  it("rejects text longer than the limit", () => {
    const elements = [text("inside-right", "字".repeat(LIMITS.textLength + 1))];
    expect(letterDraftSchema.safeParse(draft({ elements })).success).toBe(false);
  });

  it("rejects an unknown sticker", () => {
    const elements = [{ ...sticker("inside-left", 0), stickerId: "rocket" }] as CardElement[];
    expect(letterDraftSchema.safeParse(draft({ elements })).success).toBe(false);
  });

  it("rejects a placement outside the face", () => {
    const elements = [{ ...sticker("inside-left", 0), x: 1.2 }];
    expect(letterDraftSchema.safeParse(draft({ elements })).success).toBe(false);
  });

  it("requires initials when the initials stamp is chosen", () => {
    const seal = { color: "red", stamp: "initials" } as const;
    expect(letterDraftSchema.safeParse(draft({ seal })).success).toBe(false);
    expect(letterDraftSchema.safeParse(draft({ seal: { ...seal, initials: "LD" } })).success).toBe(true);
  });

  it("requires a recipient name", () => {
    expect(letterDraftSchema.safeParse(draft({ recipientName: "  " })).success).toBe(false);
  });

  it("sendLetterSchema requires an ISO deliverAt", () => {
    expect(sendLetterSchema.safeParse({ ...draft(), deliverAt: "tomorrow" }).success).toBe(false);
    expect(sendLetterSchema.safeParse({ ...draft(), deliverAt: "2026-12-23T16:00:00.000Z" }).success).toBe(true);
  });
});

describe("resolveDeliverAt", () => {
  const now = new Date("2026-12-10T04:00:00.000Z"); // 12:00 in Shanghai

  it("delivers now when asked", () => {
    expect(resolveDeliverAt({ kind: "now" }, now, CN_OFFSET)).toBe(now.toISOString());
  });

  it("delivers on Christmas Eve at local midnight", () => {
    expect(resolveDeliverAt({ kind: "christmas-eve" }, now, CN_OFFSET)).toBe("2026-12-23T16:00:00.000Z");
  });

  it("delivers on Christmas Day at local midnight", () => {
    expect(resolveDeliverAt({ kind: "christmas" }, now, CN_OFFSET)).toBe("2026-12-24T16:00:00.000Z");
  });

  it("uses local midnight for a custom date in a western timezone", () => {
    expect(resolveDeliverAt({ kind: "date", date: "2026-12-20" }, now, 300)).toBe("2026-12-20T05:00:00.000Z");
  });

  it("delivers immediately when the custom date is today", () => {
    expect(resolveDeliverAt({ kind: "date", date: "2026-12-10" }, now, CN_OFFSET)).toBe(now.toISOString());
  });

  it("refuses a custom date in the past", () => {
    expect(() => resolveDeliverAt({ kind: "date", date: "2026-12-01" }, now, CN_OFFSET)).toThrow();
  });

  it("rolls Christmas over to next year once it has passed", () => {
    const after = new Date("2026-12-26T04:00:00.000Z");
    expect(resolveDeliverAt({ kind: "christmas" }, after, CN_OFFSET)).toBe("2027-12-24T16:00:00.000Z");
  });
});

function letter(over: Partial<Letter> = {}): Letter {
  return {
    ...draft(),
    id: "abc",
    outboxId: "secret-outbox",
    deliverAt: "2026-12-23T16:00:00.000Z",
    createdAt: "2026-12-10T04:00:00.000Z",
    openedAt: null,
    recalledAt: null,
    ...over,
  };
}

describe("letterStatus", () => {
  it("is in transit before the delivery time", () => {
    expect(letterStatus(letter(), new Date("2026-12-20T00:00:00Z"))).toBe("in-transit");
  });

  it("is delivered once the delivery time has passed", () => {
    expect(letterStatus(letter(), new Date("2026-12-24T00:00:00Z"))).toBe("delivered");
  });

  it("is opened once the recipient opened it", () => {
    expect(letterStatus(letter({ openedAt: "2026-12-24T01:00:00Z" }), new Date("2026-12-25T00:00:00Z"))).toBe("opened");
  });

  it("is recalled when the sender took it back", () => {
    expect(letterStatus(letter({ recalledAt: "2026-12-11T00:00:00Z" }), new Date("2026-12-25T00:00:00Z"))).toBe("recalled");
  });
});

describe("toPublicLetter", () => {
  it("hides the card content before delivery", () => {
    const view = toPublicLetter(letter(), new Date("2026-12-20T00:00:00Z"));
    expect(view.status).toBe("in-transit");
    expect(view.content).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Merry Christmas");
  });

  it("includes the card content after delivery", () => {
    const view = toPublicLetter(letter(), new Date("2026-12-24T00:00:00Z"));
    expect(view.content?.elements).toHaveLength(2);
  });

  it("never exposes the outbox secret", () => {
    const view = toPublicLetter(letter(), new Date("2026-12-24T00:00:00Z"));
    expect(JSON.stringify(view)).not.toContain("secret-outbox");
  });

  it("hides everything but the status for a recalled letter", () => {
    const view = toPublicLetter(letter({ recalledAt: "2026-12-11T00:00:00Z" }), new Date("2026-12-24T00:00:00Z"));
    expect(view.content).toBeNull();
    expect(view.recipientName).toBe("");
  });
});
