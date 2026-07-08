import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const DB_DIR = path.join(os.homedir(), '.iacmp');
const DB_PATH = path.join(DB_DIR, 'knowledge.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS examples (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      provider    TEXT NOT NULL,           -- aws | azure | gcp | multi
      constructs  TEXT NOT NULL,           -- JSON array de construct ids
      tags        TEXT NOT NULL,           -- JSON array
      content     TEXT NOT NULL,           -- JSON: { stacks, handlers, notes }
      tokens      TEXT NOT NULL,           -- JSON array de tokens BM25 pre-computados
      validated   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      embedding   BLOB                     -- reservado: vetor float32 para busca semântica futura
    );
    CREATE INDEX IF NOT EXISTS idx_provider  ON examples(provider);
    CREATE INDEX IF NOT EXISTS idx_validated ON examples(validated);
  `);
  return _db;
}

export type ExampleRow = {
  id: string;
  title: string;
  provider: string;
  constructs: string;
  tags: string;
  content: string;
  tokens: string;
  validated: number;
  created_at: string;
  embedding: Buffer | null;
};

export function dbPath(): string { return DB_PATH; }
