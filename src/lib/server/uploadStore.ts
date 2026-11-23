import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

/** Same cap as before the move to R2. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
};

const KEY_PATTERN = /^[A-Za-z0-9_-]{16}\.(mp3|m4a|aac|wav|ogg|oga|webm|flac)$/;

export function isUploadKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * The type an upload is served with, from its extension alone. Browsers name
 * the same file differently (an m4a arrives as audio/x-m4a, audio/m4a,
 * audio/mp4a-latm...), and WebKit is the one that is picky about it.
 */
export function contentTypeForKey(key: string): string {
  return TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export type UploadCheck =
  | { ok: true; key: string; contentType: string }
  | { ok: false; error: string };

/**
 * Audio only, within the size cap. The stored key is random: the sender's
 * file name never reaches storage or URLs.
 */
export function validateUpload(file: { name: string; type: string; size: number }): UploadCheck {
  if (file.size === 0) return { ok: false, error: "文件是空的" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "音频不能超过 15 MB" };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = TYPES[ext];
  if (!byExt) return { ok: false, error: "只支持 mp3、m4a、aac、wav、ogg、webm、flac 音频" };
  if (file.type && !file.type.startsWith("audio/") && file.type !== "application/octet-stream") {
    return { ok: false, error: "只能上传音频文件" };
  }
  return { ok: true, key: `${nanoid(16)}.${ext}`, contentType: byExt };
}

export interface StoredUpload {
  /** The whole file, or just the requested span. */
  body: ArrayBuffer;
  contentType: string;
  /** Size of the whole file, whatever span `body` holds. */
  size: number;
}

/** A span to read: `length` bytes from `offset`. */
export interface ReadSpan {
  offset: number;
  length: number;
}

export interface UploadStore {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  /** The file's size without reading it, to resolve a Range header. */
  head(key: string): Promise<{ size: number } | null>;
  get(key: string, span?: ReadSpan): Promise<StoredUpload | null>;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Local development: files under a directory, type from the extension. */
export function createFsUploadStore(dir: string): UploadStore {
  return {
    async put(key, data) {
      if (!isUploadKey(key)) throw new Error("invalid upload key");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, key), new Uint8Array(data));
    },
    async head(key) {
      if (!isUploadKey(key)) return null;
      try {
        return { size: (await stat(path.join(dir, key))).size };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async get(key, span) {
      if (!isUploadKey(key)) return null;
      try {
        const buf = await readFile(path.join(dir, key));
        const start = buf.byteOffset + (span?.offset ?? 0);
        const end = span ? Math.min(start + span.length, buf.byteOffset + buf.byteLength) : buf.byteOffset + buf.byteLength;
        return { body: buf.buffer.slice(start, end) as ArrayBuffer, contentType: contentTypeForKey(key), size: buf.byteLength };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
  };
}

/** The slice of Cloudflare's R2 bucket binding we use. */
export interface R2Like {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  head(key: string): Promise<{ size: number } | null>;
  get(
    key: string,
    options?: { range?: ReadSpan },
  ): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
}

/** R2 reads only the requested span, so a 2-byte probe of a 15 MB song costs 2 bytes. */
export function createR2UploadStore(bucket: R2Like): UploadStore {
  return {
    async put(key, data, contentType) {
      if (!isUploadKey(key)) throw new Error("invalid upload key");
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async head(key) {
      if (!isUploadKey(key)) return null;
      const obj = await bucket.head(key);
      return obj ? { size: obj.size } : null;
    },
    async get(key, span) {
      if (!isUploadKey(key)) return null;
      const obj = await bucket.get(key, span ? { range: span } : undefined);
      if (!obj) return null;
      return {
        body: await obj.arrayBuffer(),
        contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
        size: obj.size,
      };
    },
  };
}

let uploadOverride: UploadStore | null = null;

export function setUploadStoreForTests(store: UploadStore | null): void {
  uploadOverride = store;
}

/** R2 on Cloudflare, data/uploads in local development. */
export async function getUploadStore(): Promise<UploadStore> {
  if (uploadOverride) return uploadOverride;
  const { cloudflareBindings } = await import("./cloudflare");
  const env = await cloudflareBindings();
  if (env?.AUDIO) return createR2UploadStore(env.AUDIO);
  return createFsUploadStore(path.join(process.cwd(), "data", "uploads"));
}
