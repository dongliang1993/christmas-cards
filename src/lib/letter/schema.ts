import { z } from "zod";
import {
  ENVELOPE_COLORS,
  LIMITS,
  PAPER_STOCK_IDS,
  SEAL_COLORS,
  STAMP_IDS,
  STICKER_IDS,
  type CardElement,
} from "./model";

const TEMPLATE_IDS = ["first-snow", "home-christmas", "sweet-dreams", "lantern-light"] as const;
const FACES = ["inside-left", "inside-right"] as const;

const placement = {
  face: z.enum(FACES),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(LIMITS.minScale).max(LIMITS.maxScale),
  rotation: z.number().min(-Math.PI * 2).max(Math.PI * 2),
  z: z.number().int().min(0).max(1000),
};

const stickerElement = z.object({
  kind: z.literal("sticker"),
  stickerId: z.enum(STICKER_IDS),
  ...placement,
});

const textElement = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1, "文字不能为空").max(LIMITS.textLength, `每段文字最多 ${LIMITS.textLength} 字`),
  font: z.enum(["hand-en", "hand-zh", "serif"]),
  ink: z.enum(["black", "red", "gold"]),
  ...placement,
});

const elementSchema = z.discriminatedUnion("kind", [stickerElement, textElement]);

function countOn(elements: CardElement[], kind: CardElement["kind"], face: string): number {
  return elements.filter((e) => e.kind === kind && e.face === face).length;
}

const sealSchema = z
  .object({
    color: z.enum(SEAL_COLORS),
    stamp: z.enum(STAMP_IDS),
    initials: z.string().trim().min(1).max(2).optional(),
  })
  .refine((s) => s.stamp !== "initials" || Boolean(s.initials), "首字母印章需要填写首字母");

const audioUrl = z
  .string()
  .trim()
  .refine((v) => v.startsWith("/api/audio/") || v.startsWith("/uploads/"), "无效的音频路径");

const draftShape = {
  templateId: z.enum(TEMPLATE_IDS),
  paper: z.enum(PAPER_STOCK_IDS),
  envelopeColor: z.enum(ENVELOPE_COLORS),
  seal: sealSchema,
  recipientName: z.string().trim().min(1, "请填写收件人").max(LIMITS.recipientLength),
  elements: z.array(elementSchema).max((LIMITS.stickersPerFace + LIMITS.textsPerFace) * FACES.length),
  audioUrl: audioUrl.nullable(),
  audioName: z.string().trim().max(160).nullable(),
};

function checkLimits(d: { elements: CardElement[] }, ctx: z.RefinementCtx): void {
  for (const face of FACES) {
    if (countOn(d.elements, "sticker", face) > LIMITS.stickersPerFace) {
      ctx.addIssue({ code: "custom", message: `每一面最多 ${LIMITS.stickersPerFace} 张贴纸`, path: ["elements"] });
    }
    if (countOn(d.elements, "text", face) > LIMITS.textsPerFace) {
      ctx.addIssue({ code: "custom", message: `每一面最多 ${LIMITS.textsPerFace} 段文字`, path: ["elements"] });
    }
  }
}

/** A letter ready to send. */
export const letterDraftSchema = z.object(draftShape).superRefine(checkLimits);

/** A draft still being made: same rules, but the recipient may be blank. */
export const storedDraftSchema = z
  .object({ ...draftShape, recipientName: z.string().max(LIMITS.recipientLength) })
  .superRefine(checkLimits);

/** Body of POST /api/letters: the draft plus its resolved delivery time. */
export const sendLetterSchema = letterDraftSchema.and(
  z.object({
    deliverAt: z.iso.datetime({ message: "无效的送达时间" }),
    outboxId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).nullable().optional(),
  }),
);

export type SendLetterBody = z.infer<typeof sendLetterSchema>;
