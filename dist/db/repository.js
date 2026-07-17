import { getDb } from './schema.js';
import { precomputeTokens } from './bm25.js';
import { buildFtsText, syncFtsRow, rebuildFts as rebuildFtsShared, ftsNeedsRebuild as ftsNeedsRebuildShared, } from '@iacmp/knowledge';
export function upsertExample(ex) {
    const db = getDb();
    const tokens = precomputeTokens({ title: ex.title, tags: ex.tags, constructs: ex.constructs, content: ex.content });
    const tx = db.transaction(() => {
        db.prepare(`
      INSERT INTO examples (id, title, provider, constructs, tags, content, tokens, validated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, provider = excluded.provider,
        constructs = excluded.constructs, tags = excluded.tags,
        content = excluded.content, tokens = excluded.tokens,
        validated = excluded.validated
    `).run(ex.id, ex.title, ex.provider, JSON.stringify(ex.constructs), JSON.stringify(ex.tags), JSON.stringify(ex.content), JSON.stringify(tokens), ex.validated !== false ? 1 : 0);
        // Índice FTS em sincronia — corpo e sync vêm da fonte única @iacmp/knowledge.
        syncFtsRow(db, ex.id, buildFtsText({ title: ex.title, tags: ex.tags, constructs: ex.constructs, content: ex.content }));
    });
    tx();
}
/** Reconstrói o índice FTS a partir de examples (delegado à fonte única). */
export function rebuildFts() {
    return rebuildFtsShared(getDb());
}
/** true se o índice FTS está defasado em relação a examples (precisa reconstruir). */
export function ftsNeedsRebuild() {
    return ftsNeedsRebuildShared(getDb());
}
export function countExamples() {
    const db = getDb();
    return db.prepare('SELECT COUNT(*) as n FROM examples').get().n;
}
// Lista TODOS os exemplos (validados e não-validados). validated deixou de ser
// portão de visibilidade — é sinal de confiança, devolvido aqui para exibição.
export function listExamples(provider) {
    const db = getDb();
    const rows = provider
        ? db.prepare('SELECT id, title, provider, tags, validated FROM examples WHERE provider = ? ORDER BY validated DESC, id').all(provider)
        : db.prepare('SELECT id, title, provider, tags, validated FROM examples ORDER BY validated DESC, id').all();
    return rows.map(r => ({
        id: r.id, title: r.title, provider: r.provider,
        tags: JSON.parse(r.tags), validated: r.validated === 1,
    }));
}
