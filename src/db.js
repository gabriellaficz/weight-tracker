import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const DEFAULT_DATA_DIR = "/home/ubuntu/app_data/weight-tracker";

export function resolveDataDir() {
  return process.env.APP_DATA_DIR || DEFAULT_DATA_DIR;
}

export async function openDb() {
  const dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "app.sqlite");
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  await db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export async function applyMigrations(db, migrationsDir) {
  const dir = migrationsDir || path.join(process.cwd(), "migrations");
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );

  const rows = await db.all("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.id));

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const now = new Date().toISOString();
    await db.exec("BEGIN");
    try {
      await db.exec(sql);
      await db.run(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
        [file, now]
      );
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
}
