// Semeadura do corpus → SQLite. A lógica agora vive na fonte única
// @iacmp/knowledge (ensureSeeded); aqui só passamos a conexão viva do servidor
// para não abrir um segundo handle no mesmo banco.
import { ensureSeeded } from '@iacmp/knowledge';
import { getDb } from '../db/schema.js';
export function migrateStatic() {
    return ensureSeeded({ db: getDb() }).seeded;
}
