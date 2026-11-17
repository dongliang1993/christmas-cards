CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL,
  deliver_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  opened_at TEXT,
  recalled_at TEXT,
  draft TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS letters_outbox ON letters (outbox_id, created_at);
