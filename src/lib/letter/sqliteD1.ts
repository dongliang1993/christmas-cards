import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Like, D1StatementLike } from "./repository";

/**
 * A D1-shaped wrapper over Node's built-in SQLite, for local development
 * and tests. Production uses the real D1 binding instead (spec §3 deploy).
 */
export function openSqliteD1(path: string): D1Like {
  const db = new DatabaseSync(path);

  const statement = (sql: string, values: SQLInputValue[]): D1StatementLike => ({
    bind: (...next: unknown[]) => statement(sql, next as SQLInputValue[]),
    first: async <T>() => (db.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
    run: async () => {
      const info = db.prepare(sql).run(...values);
      return { meta: { changes: Number(info.changes) } };
    },
  });

  return {
    prepare: (sql) => statement(sql, []),
    exec: async (sql) => {
      db.exec(sql);
    },
  };
}
