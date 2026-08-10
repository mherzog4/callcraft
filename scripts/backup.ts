import Database from "better-sqlite3";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { argumentValue } from "@/src/cli/arguments";
import { getEnv } from "@/src/env";

// `VACUUM INTO` is the only correct way to copy this database. It takes a
// consistent snapshot of a live WAL database — a file copy can capture a torn
// state — and it writes a compacted file, so free pages that may still hold
// deleted transcript text do not survive into the backup. That second property
// is what keeps a backup consistent with the retention promise in the README.
const source = getEnv().DATABASE_PATH;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination =
  argumentValue("--out") ?? path.join(path.dirname(source), "backups", `app-${stamp}.db`);

mkdirSync(path.dirname(destination), { recursive: true });

const db = new Database(source, { readonly: true });
try {
  db.prepare("VACUUM INTO ?").run(destination);
} finally {
  db.close();
}

// A backup nobody has opened is a guess. Verify the copy before reporting
// success, so a corrupt or truncated snapshot fails here rather than during a
// restore that is already an emergency.
const backup = new Database(destination, { readonly: true });
try {
  const integrity = backup.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error(`Backup failed integrity_check: ${String(integrity)}`);

  const tables = backup
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => (row as { name: string }).name);
  for (const required of ["sellers", "calls", "draft_revisions", "jobs"]) {
    if (!tables.includes(required)) throw new Error(`Backup is missing the ${required} table`);
  }

  const counts = {
    sellers: backup.prepare("SELECT count(*) AS value FROM sellers").get() as { value: number },
    calls: backup.prepare("SELECT count(*) AS value FROM calls").get() as { value: number },
  };
  console.log(
    `Backup verified: ${destination} (${statSync(destination).size} bytes, ` +
      `${counts.sellers.value} seller(s), ${counts.calls.value} call(s)).`,
  );
} finally {
  backup.close();
}

console.log(
  "Store this file on encrypted storage with an expiry aligned to TRANSCRIPT_RETENTION_DAYS.",
);
