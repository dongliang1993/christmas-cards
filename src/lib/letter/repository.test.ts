import { beforeEach, describe, expect, it } from "vitest";
import type { LetterDraft } from "./model";
import { createLetterRepository, LETTERS_SCHEMA_SQL, type LetterRepository } from "./repository";
import { openSqliteD1 } from "./sqliteD1";

const T0 = new Date("2026-12-10T04:00:00.000Z");
const BEFORE = new Date("2026-12-20T00:00:00.000Z");
const AFTER = new Date("2026-12-24T00:00:00.000Z");
const DELIVER = "2026-12-23T16:00:00.000Z";

const draft: LetterDraft = {
  templateId: "winter-moonlight",
  paper: "kraft",
  envelopeColor: "sage",
  seal: { color: "gold", stamp: "star" },
  recipientName: "阿树",
  elements: [{ kind: "sticker", stickerId: "holly", face: "inside-left", x: 0.3, y: 0.4, scale: 1.2, rotation: 0.1, z: 0 }],
  audioUrl: null,
  audioName: null,
};

let repo: LetterRepository;

beforeEach(async () => {
  const db = openSqliteD1(":memory:");
  await db.exec(LETTERS_SCHEMA_SQL);
  repo = createLetterRepository(db);
});

describe("letter repository", () => {
  it("creates a letter with a fresh outbox when none is given", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    expect(letter.id).toMatch(/^[A-Za-z0-9_-]{10,}$/);
    expect(letter.outboxId).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(await repo.findById(letter.id)).toEqual(letter);
  });

  it("round-trips the full draft", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    const stored = await repo.findById(letter.id);
    expect(stored?.elements).toEqual(draft.elements);
    expect(stored?.seal).toEqual(draft.seal);
    expect(stored?.deliverAt).toBe(DELIVER);
  });

  it("files letters sent with the same outbox together, newest first", async () => {
    const first = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    const second = await repo.create(
      { ...draft, recipientName: "小满", deliverAt: DELIVER },
      first.outboxId,
      new Date(T0.getTime() + 1000),
    );
    const list = await repo.listByOutbox(first.outboxId);
    expect(list.map((l) => l.id)).toEqual([second.id, first.id]);
  });

  it("treats a delivery time in the past as now", async () => {
    const letter = await repo.create({ ...draft, deliverAt: "2020-01-01T00:00:00.000Z" }, null, T0);
    expect(letter.deliverAt).toBe(T0.toISOString());
  });

  it("returns null for an unknown letter", async () => {
    expect(await repo.findById("nope")).toBeNull();
  });

  it("refuses to mark a letter opened before it arrives", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    expect(await repo.markOpened(letter.id, BEFORE)).toEqual({ ok: false, reason: "not-delivered" });
  });

  it("records the first opening only", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    const first = await repo.markOpened(letter.id, AFTER);
    const later = await repo.markOpened(letter.id, new Date(AFTER.getTime() + 60_000));
    expect(first.ok && first.letter.openedAt).toBe(AFTER.toISOString());
    expect(later.ok && later.letter.openedAt).toBe(AFTER.toISOString());
  });

  it("refuses a recall from another outbox", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    expect(await repo.recall(letter.id, "someone-elses-outbox", BEFORE)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses a recall after delivery", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    expect(await repo.recall(letter.id, letter.outboxId, AFTER)).toEqual({ ok: false, reason: "already-delivered" });
  });

  it("recalls a letter still in transit", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    const result = await repo.recall(letter.id, letter.outboxId, BEFORE);
    expect(result.ok && result.letter.recalledAt).toBe(BEFORE.toISOString());
  });

  it("cannot open a recalled letter", async () => {
    const letter = await repo.create({ ...draft, deliverAt: DELIVER }, null, T0);
    await repo.recall(letter.id, letter.outboxId, BEFORE);
    expect(await repo.markOpened(letter.id, AFTER)).toEqual({ ok: false, reason: "recalled" });
  });
});
