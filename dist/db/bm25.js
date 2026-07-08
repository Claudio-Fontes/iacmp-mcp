// BM25 sobre SQLite — índice invertido em memória construído na primeira query
// k1=1.5, b=0.75 (parâmetros padrão da literatura)
import { getDb } from './schema.js';
const K1 = 1.5;
const B = 0.75;
function tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 1);
}
export function precomputeTokens(example) {
    return tokenize([example.title, ...example.tags, ...example.constructs, ...example.content.notes].join(' '));
}
export function search(query, opts = {}) {
    const db = getDb();
    const { provider, limit = 5 } = opts;
    const where = provider ? `WHERE provider = '${provider}' AND validated = 1` : `WHERE validated = 1`;
    const rows = db.prepare(`SELECT * FROM examples ${where}`).all();
    if (rows.length === 0)
        return [];
    const qTokens = tokenize(query);
    if (qTokens.length === 0)
        return rows.slice(0, limit).map(r => toResult(r, 0));
    // Média de tamanho de documento
    const avgLen = rows.reduce((s, r) => s + JSON.parse(r.tokens).length, 0) / rows.length;
    const N = rows.length;
    // IDF por token
    const df = {};
    for (const row of rows) {
        const toks = new Set(JSON.parse(row.tokens));
        for (const t of qTokens) {
            if (toks.has(t))
                df[t] = (df[t] ?? 0) + 1;
        }
    }
    const scored = rows.map(row => {
        const toks = JSON.parse(row.tokens);
        const dl = toks.length;
        let score = 0;
        for (const t of qTokens) {
            const tf = toks.filter(x => x === t).length;
            if (tf === 0)
                continue;
            const idf = Math.log((N - (df[t] ?? 0) + 0.5) / ((df[t] ?? 0) + 0.5) + 1);
            score += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (dl / avgLen)));
        }
        return { row, score };
    });
    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => toResult(s.row, s.score));
}
function toResult(row, score) {
    const content = JSON.parse(row.content);
    return {
        id: row.id,
        title: row.title,
        provider: row.provider,
        constructs: JSON.parse(row.constructs),
        tags: JSON.parse(row.tags),
        content,
        score,
    };
}
