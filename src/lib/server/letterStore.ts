import path from "node:path";
import { mkdirSync } from "node:fs";
import { createLetterRepository, LETTERS_SCHEMA_SQL, type LetterRepository } from "@/lib/letter/repository";

let override: LetterRepository | null = null;
let local: Promise<LetterRepository> | null = null;

/** Tests swap in an in-memory repository; pass null to restore. */
export function setLetterRepositoryForTests(repo: LetterRepository | null): void {
  override = repo;
}

async function openLocal(): Promise<LetterRepository> {
  const { openSqliteD1 } = await import("@/lib/letter/sqliteD1");
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = openSqliteD1(path.join(dir, "letters.db"));
  await db.exec(LETTERS_SCHEMA_SQL);
  return createLetterRepository(db);
}

/**
 * The letter store for this request. Local development uses a SQLite file
 * under data/; the Cloudflare build switches to the D1 binding (Task 13).
 */
export async function getLetterRepository(): Promise<LetterRepository> {
  if (override) return override;
  local ??= openLocal();
  return local;
}
