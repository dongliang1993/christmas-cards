import { describe, expect, it } from "vitest";
import { parsePrebakedManifest, prebakedManifestSchema } from "./prebakedManifest";

const valid = {
  version: 1,
  card: "winter-moonlight",
  entries: [
    {
      key: "/assets/cards/winter-moonlight/cover.webp|1|2.2",
      name: "cover",
      normal: "cover-normal.webp",
      surface: "cover-surface.webp",
    },
    { key: "snow|winter-moonlight", name: "snow-mask", src: "snow-mask.webp" },
  ],
};

describe("parsePrebakedManifest: trust boundary for generated assets", () => {
  it("indexes the entries by their cache key", () => {
    const manifest = parsePrebakedManifest(valid);
    expect(manifest.card).toBe("winter-moonlight");
    expect(manifest.byKey.get("snow|winter-moonlight")).toMatchObject({ src: "snow-mask.webp" });
    expect(manifest.byKey.get("/assets/cards/winter-moonlight/cover.webp|1|2.2")).toMatchObject({
      normal: "cover-normal.webp",
      surface: "cover-surface.webp",
    });
  });

  it("rejects a wrong version", () => {
    expect(() => parsePrebakedManifest({ ...valid, version: 2 })).toThrow();
  });

  it("rejects entries with unsafe file names", () => {
    expect(() =>
      parsePrebakedManifest({
        ...valid,
        entries: [{ key: "snow|x", name: "snow-mask", src: "../../etc/passwd" }],
      }),
    ).toThrow();
    expect(() =>
      parsePrebakedManifest({
        ...valid,
        entries: [{ key: "a|1", name: "cover", normal: "https://evil.example/n.webp", surface: "s.webp" }],
      }),
    ).toThrow();
  });

  it("rejects entries missing their maps", () => {
    expect(() => parsePrebakedManifest({ ...valid, entries: [{ key: "a|1", name: "cover" }] })).toThrow();
  });

  it("the schema is exported so the dev baker writes the same shape", () => {
    expect(prebakedManifestSchema.parse(valid).entries).toHaveLength(2);
  });
});

describe("prebakedBase: every card in the gallery reads its own prebaked assets", () => {
  it("points each template at a baked/ directory that exists", async () => {
    const { existsSync } = await import("node:fs");
    const { CARD_TEMPLATES } = await import("./templates");
    const { prebakedBase } = await import("./prebakedManifest");
    for (const t of CARD_TEMPLATES) {
      const base = prebakedBase(t.id);
      expect(base).toBe(`/assets/cards/${t.id}/baked`);
      expect(existsSync(`public${base}/manifest.json`)).toBe(true);
    }
  });
});
