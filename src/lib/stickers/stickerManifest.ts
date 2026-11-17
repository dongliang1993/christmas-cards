import { z } from "zod";
import { STICKER_IDS } from "@/lib/letter/model";

const entrySchema = z.object({
  id: z.enum(STICKER_IDS),
  label: z.string().min(1),
  material: z.enum(["paint", "foil", "pearl"]),
  src: z.string().startsWith("/assets/stickers/"),
});

const manifestSchema = z.object({
  set: z.string().min(1),
  stickers: z.array(entrySchema),
});

export type StickerEntry = z.infer<typeof entrySchema>;
export type StickerManifest = z.infer<typeof manifestSchema>;

/** Validate manifest.json from scripts/stickers/cutout.py; throws on a bad file. */
export function parseStickerManifest(json: unknown): StickerManifest {
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`贴纸清单无效: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  return parsed.data;
}
