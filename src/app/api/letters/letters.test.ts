import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLetterRepository, LETTERS_SCHEMA_SQL } from "@/lib/letter/repository";
import { openSqliteD1 } from "@/lib/letter/sqliteD1";
import { setLetterRepositoryForTests } from "@/lib/server/letterStore";
import { POST as send } from "./route";
import { GET as read } from "./[id]/route";
import { POST as opened } from "./[id]/opened/route";
import { POST as recall } from "./[id]/recall/route";
import { GET as outbox } from "../outbox/[outboxId]/route";

const DAY = 86_400_000;

function body(deliverAt: string) {
  return {
    templateId: "winter-moonlight",
    paper: "cold-press",
    envelopeColor: "ivory",
    seal: { color: "red", stamp: "holly" },
    recipientName: "小雪",
    elements: [
      { kind: "text", text: "圣诞快乐", font: "hand-zh", ink: "gold", face: "inside-right", x: 0.5, y: 0.4, scale: 1, rotation: 0, z: 0 },
    ],
    audioUrl: null,
    audioName: null,
    deliverAt,
  };
}

function post(json: unknown): Request {
  return new Request("http://test/api", { method: "POST", body: JSON.stringify(json), headers: { "content-type": "application/json" } });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

async function sendLetter(deliverAt: string): Promise<{ id: string; outboxId: string }> {
  const res = await send(post(body(deliverAt)));
  const json = await res.json();
  return json.data;
}

beforeEach(async () => {
  const db = openSqliteD1(":memory:");
  await db.exec(LETTERS_SCHEMA_SQL);
  setLetterRepositoryForTests(createLetterRepository(db));
});

afterEach(() => setLetterRepositoryForTests(null));

describe("POST /api/letters", () => {
  it("rejects an invalid body with a readable message", async () => {
    const res = await send(post({ ...body(new Date().toISOString()), recipientName: "" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("收件人");
  });

  it("rejects malformed JSON", async () => {
    const res = await send(new Request("http://test/api", { method: "POST", body: "{nope" }));
    expect(res.status).toBe(400);
  });

  it("rejects a delivery more than a year away", async () => {
    const res = await send(post(body(new Date(Date.now() + 400 * DAY).toISOString())));
    expect(res.status).toBe(400);
  });

  it("creates a letter and returns its id and outbox", async () => {
    const res = await send(post(body(new Date().toISOString())));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBeTruthy();
    expect(json.data.outboxId).toBeTruthy();
  });
});

describe("GET /api/letters/:id", () => {
  it("returns 404 for an unknown letter", async () => {
    const res = await read(new Request("http://test"), ctx({ id: "missing" }));
    expect(res.status).toBe(404);
  });

  it("shows only the envelope while in transit", async () => {
    const { id } = await sendLetter(new Date(Date.now() + DAY).toISOString());
    const json = await (await read(new Request("http://test"), ctx({ id }))).json();
    expect(json.data.status).toBe("in-transit");
    expect(json.data.content).toBeNull();
    expect(JSON.stringify(json)).not.toContain("圣诞快乐");
  });

  it("shows the card once delivered", async () => {
    const { id } = await sendLetter(new Date().toISOString());
    const json = await (await read(new Request("http://test"), ctx({ id }))).json();
    expect(json.data.content.elements[0].text).toBe("圣诞快乐");
  });
});

describe("POST /api/letters/:id/opened", () => {
  it("refuses before delivery", async () => {
    const { id } = await sendLetter(new Date(Date.now() + DAY).toISOString());
    expect((await opened(new Request("http://test", { method: "POST" }), ctx({ id }))).status).toBe(409);
  });

  it("records the opening after delivery", async () => {
    const { id, outboxId } = await sendLetter(new Date().toISOString());
    expect((await opened(new Request("http://test", { method: "POST" }), ctx({ id }))).status).toBe(200);
    const list = await (await outbox(new Request("http://test"), ctx({ outboxId }))).json();
    expect(list.data.letters[0].status).toBe("opened");
  });
});

describe("GET /api/outbox/:outboxId", () => {
  it("rejects a malformed outbox id", async () => {
    expect((await outbox(new Request("http://test"), ctx({ outboxId: "x" }))).status).toBe(400);
  });

  it("lists the outbox's letters with their status", async () => {
    const { outboxId } = await sendLetter(new Date(Date.now() + DAY).toISOString());
    const json = await (await outbox(new Request("http://test"), ctx({ outboxId }))).json();
    expect(json.data.letters).toHaveLength(1);
    expect(json.data.letters[0]).toMatchObject({ recipientName: "小雪", status: "in-transit" });
  });
});

describe("POST /api/letters/:id/recall", () => {
  it("is forbidden from another outbox", async () => {
    const { id } = await sendLetter(new Date(Date.now() + DAY).toISOString());
    const res = await recall(post({ outboxId: "another-outbox-id-0000" }), ctx({ id }));
    expect(res.status).toBe(403);
  });

  it("recalls a letter in transit", async () => {
    const { id, outboxId } = await sendLetter(new Date(Date.now() + DAY).toISOString());
    expect((await recall(post({ outboxId }), ctx({ id }))).status).toBe(200);
    const json = await (await read(new Request("http://test"), ctx({ id }))).json();
    expect(json.data.status).toBe("recalled");
  });

  it("refuses once delivered", async () => {
    const { id, outboxId } = await sendLetter(new Date().toISOString());
    expect((await recall(post({ outboxId }), ctx({ id }))).status).toBe(409);
  });
});
