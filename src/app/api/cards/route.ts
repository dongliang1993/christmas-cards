import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { saveCard } from "@/lib/storage";
import type { ApiResponse, ChristmasCardRecord } from "@/lib/types";

const createCardSchema = z.object({
  templateId: z.enum([
    "first-snow",
    "home-christmas",
    "sweet-dreams",
    "lantern-light",
  ]),
  message: z
    .string()
    .trim()
    .min(1, "请填写圣诞祝福语")
    .max(600, "祝福语最多 600 字"),
  signature: z.string().trim().max(80, "落款最多 80 字").default(""),
  audioUrl: z
    .string()
    .trim()
    .refine(
      (val) => val.startsWith("/uploads/"),
      "无效的音频路径",
    )
    .nullable()
    .optional(),
  audioName: z.string().trim().max(160).nullable().optional(),
});

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<ChristmasCardRecord>>> {
  try {
    const body: unknown = await request.json();
    const parsed = createCardSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "请求参数不合法";
      return NextResponse.json(
        { success: false, error: firstIssue },
        { status: 400 },
      );
    }

    const record: ChristmasCardRecord = {
      id: nanoid(8),
      templateId: parsed.data.templateId,
      message: parsed.data.message,
      signature: parsed.data.signature,
      audioUrl: parsed.data.audioUrl ?? null,
      audioName: parsed.data.audioName ?? null,
      createdAt: new Date().toISOString(),
    };

    const saved = await saveCard(record);

    return NextResponse.json(
      { success: true, data: saved },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create card failed:", error);
    return NextResponse.json(
      { success: false, error: "创建贺卡失败，请稍后重试" },
      { status: 500 },
    );
  }
}
