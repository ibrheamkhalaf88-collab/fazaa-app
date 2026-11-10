import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** A D1-shaped wrapper over Node's built-in SQLite, so the real SQL in store/d1.js is tested. */
export function createFakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../server/api/schema.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind: (...args) => ({
          first: async () => stmt.get(...args) ?? null,
          all: async () => ({ results: stmt.all(...args) }),
          run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
        }),
      };
    },
  };
}
