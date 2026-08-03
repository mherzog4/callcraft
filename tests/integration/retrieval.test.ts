import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { sqliteVecNearest } from "@/src/evals/retrieval";

function vector(first: number, second: number): number[] {
  const value = Array.from({ length: 384 }, () => 0);
  value[0] = first;
  value[1] = second;
  return value;
}

describe("optional sqlite-vec retrieval experiment", () => {
  it("retrieves the nearest transcript segment without changing the default pipeline", () => {
    const db = new Database(":memory:");
    try {
      const nearest = sqliteVecNearest({
        db,
        vectors: [vector(1, 0), vector(0, 1), vector(-1, 0)],
        query: vector(0.9, 0.1),
        topK: 2,
      });
      expect(nearest[0]).toBe(0);
      expect(nearest).toHaveLength(2);
    } finally {
      db.close();
    }
  });
});
