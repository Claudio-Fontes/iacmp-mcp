import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ensureFtsSchema } from '@iacmp/knowledge';
// DB path configurável via IACMP_MCP_DB (permite bancos isolados p/ teste e
// múltiplas bases). Default: ~/.iacmp/knowledge.db.
const DB_PATH = process.env.IACMP_MCP_DB || path.join(os.homedir(), '.iacmp', 'knowledge.db');
let _db = null;
export function getDb() {
    if (_db)
        return _db;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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
      tokens      TEXT NOT NULL,           -- LEGADO: tokens pré-computados; a busca agora usa examples_fts
      validated   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      embedding   BLOB                     -- reservado: vetor float32 para busca semântica futura
    );
    CREATE INDEX IF NOT EXISTS idx_provider  ON examples(provider);
  `);
    // Índice FTS5 (BM25 nativo): schema definido na fonte única @iacmp/knowledge,
    // compartilhada com o CLI (packages/ai) para não divergir.
    ensureFtsSchema(_db);
    return _db;
}
export function dbPath() { return DB_PATH; }
