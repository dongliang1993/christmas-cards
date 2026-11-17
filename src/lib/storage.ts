import path from "node:path";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

/** Local-dev home of uploaded audio (replaced by R2 on Cloudflare, Task 13). */
export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
