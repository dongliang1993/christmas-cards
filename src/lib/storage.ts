import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChristmasCardRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_FILE = path.join(DATA_DIR, "cards.json");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function readAllCards(): Promise<Record<string, ChristmasCardRecord>> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(CARDS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, ChristmasCardRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}

async function writeAllCards(
  cards: Record<string, ChristmasCardRecord>,
): Promise<void> {
  await ensureDirs();
  const tmpFile = `${CARDS_FILE}.tmp.${Date.now()}`;
  await fs.writeFile(tmpFile, JSON.stringify(cards, null, 2), "utf8");
  await fs.rename(tmpFile, CARDS_FILE);
}

export async function saveCard(
  record: ChristmasCardRecord,
): Promise<ChristmasCardRecord> {
  const existing = await readAllCards();
  const updated: Record<string, ChristmasCardRecord> = {
    ...existing,
    [record.id]: record,
  };
  await writeAllCards(updated);
  return record;
}

export async function getCardById(
  id: string,
): Promise<ChristmasCardRecord | null> {
  const cards = await readAllCards();
  return cards[id] ?? null;
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
