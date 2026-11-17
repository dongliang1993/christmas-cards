import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getUploadsDir } from "@/lib/storage";
import type { ApiResponse } from "@/lib/types";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".aac",
  ".flac",
  ".webm",
]);

const ALLOWED_MIME_PREFIXES = ["audio/"];

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse<{ url: string; filename: string }>>> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "请选择一个音频文件上传" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "上传的文件为空" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "音频文件不能超过 15MB" },
        { status: 400 },
      );
    }

    const originalName = file.name || "song.mp3";
    const ext = path.extname(originalName).toLowerCase();
    const mimeOk =
      file.type === "" ||
      file.type === "application/octet-stream" ||
      ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));

    if (!ALLOWED_EXTENSIONS.has(ext) || !mimeOk) {
      return NextResponse.json(
        {
          success: false,
          error: "仅支持 MP3、WAV、M4A、OGG、AAC、FLAC 格式的音频文件",
        },
        { status: 400 },
      );
    }

    const uploadsDir = getUploadsDir();
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeFilename = `${nanoid(12)}${ext}`;
    const targetPath = path.join(uploadsDir, safeFilename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(targetPath, buffer);

    return NextResponse.json({
      success: true,
      data: {
        url: `/uploads/${safeFilename}`,
        filename: originalName,
      },
    });
  } catch (error) {
    console.error("Audio upload failed:", error);
    return NextResponse.json(
      { success: false, error: "音频上传失败，请稍后重试" },
      { status: 500 },
    );
  }
}
