import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LETTERS_SCHEMA_SQL } from "@/lib/letter/repository";
import { createFsUploadStore, isUploadKey, MAX_UPLOAD_BYTES, validateUpload } from "./uploadStore";

describe("validateUpload", () => {
  it("accepts an mp3 and gives it a random key keeping the extension", () => {
    const r = validateUpload({ name: "我的歌.mp3", type: "audio/mpeg", size: 3_000_000 });
    expect(r.ok && r.key).toMatch(/^[A-Za-z0-9_-]{16}\.mp3$/);
  });

  it("rejects a non-audio file", () => {
    expect(validateUpload({ name: "x.png", type: "image/png", size: 100 }).ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ name: "x.mp3", type: "audio/mpeg", size: 0 }).ok).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    expect(validateUpload({ name: "x.mp3", type: "audio/mpeg", size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });

  it("falls back to the extension when the browser sends no type", () => {
    const r = validateUpload({ name: "voice.m4a", type: "", size: 10 });
    expect(r.ok && r.contentType).toBe("audio/mp4");
  });
});

describe("isUploadKey", () => {
  it("refuses path tricks", () => {
    expect(isUploadKey("../../etc/passwd")).toBe(false);
    expect(isUploadKey("abcdefghijklmnop.mp3")).toBe(true);
  });
});

describe("filesystem upload store", () => {
  it("stores and returns a file with its type", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uploads-"));
    const store = createFsUploadStore(dir);
    await store.put("abcdefghijklmnop.mp3", new TextEncoder().encode("hi").buffer as ArrayBuffer, "audio/mpeg");
    const got = await store.get("abcdefghijklmnop.mp3");
    expect(got?.contentType).toBe("audio/mpeg");
    expect(new TextDecoder().decode(got?.body)).toBe("hi");
    expect(await store.get("missingmissingmi.mp3")).toBeNull();
  });
});

describe("D1 migration", () => {
  it("matches the schema the repository creates", () => {
    const sql = readFileSync(path.join(process.cwd(), "migrations/0001_letters.sql"), "utf8").trim();
    expect(sql).toBe(LETTERS_SCHEMA_SQL.trim());
  });
});
