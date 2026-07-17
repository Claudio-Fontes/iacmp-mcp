// Busca da knowledge base — delega ao retrieval canônico de @iacmp/knowledge
// (FTS5 + boost de validated), compartilhado com o CLI (packages/ai). Este
// módulo só adapta o resultado ao formato SearchResult do servidor MCP.
import { getDb } from './schema.js';
import { searchExamples, tokenize } from '@iacmp/knowledge';
// LEGADO: alimenta a coluna examples.tokens (não usada pela busca). Reusa o
// tokenizer da fonte única para não divergir.
export function precomputeTokens(example) {
    return tokenize([example.title, ...example.tags, ...example.constructs, ...example.content.notes].join(' '));
}
export function search(query, opts = {}) {
    const { provider, limit = 5 } = opts;
    const scored = searchExamples(getDb(), query, { provider, limit });
    if (!scored)
        return []; // FTS não pronto (o server reconstrói na inicialização)
    return scored.map(toResult);
}
function toResult(row) {
    return {
        id: row.id,
        title: row.title,
        provider: row.provider,
        constructs: JSON.parse(row.constructs),
        tags: JSON.parse(row.tags),
        content: JSON.parse(row.content),
        validated: row.validated === 1,
        score: row.score,
    };
}
