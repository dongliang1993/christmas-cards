import { NextResponse } from "next/server";
import { getCardById } from "@/lib/storage";
import type { ApiResponse, ChristmasCardRecord } from "@/lib/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<ChristmasCardRecord>>> {
  try {
    const { id } = await context.params;
    if (!id || !/^[A-Za-z0-9_-]{4,32}$/.test(id)) {
      return NextResponse.json(
        { success: false, error: "无效的贺卡链接" },
        { status: 400 },
      );
    }

    const card = await getCardById(id);
    if (!card) {
      return NextResponse.json(
        { success: false, error: "没有找到这张圣诞贺卡" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: card });
  } catch (error) {
    console.error("Fetch card failed:", error);
    return NextResponse.json(
      { success: false, error: "读取贺卡失败" },
      { status: 500 },
    );
  }
}
