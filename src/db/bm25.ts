// BM25 sobre SQLite — índice invertido em memória construído na primeira query
// k1=1.5, b=0.75 (parâmetros padrão da literatura)

import { getDb, type ExampleRow } from './schema.js';

const K1 = 1.5;
const B  = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(t => t.length > 1);
}

export function precomputeTokens(example: {
  title: string; tags: string[]; constructs: string[]; content: { notes: string[] };
}): string[] {
  return tokenize(
    [example.title, ...example.tags, ...example.constructs, ...example.content.notes].join(' ')
  );
}

export interface SearchResult {
  id: string;
  title: string;
  provider: string;
  constructs: string[];
  tags: string[];
  content: { stacks: Record<string, string>; handlers: Record<string, string>; notes: string[] };
  score: number;
}

export function search(query: string, opts: { provider?: string; limit?: number } = {}): SearchResult[] {
  const db = getDb();
  const { provider, limit = 5 } = opts;

  const where = provider ? `WHERE provider = '${provider}' AND validated = 1` : `WHERE validated = 1`;
  const rows = db.prepare(`SELECT * FROM examples ${where}`).all() as ExampleRow[];
  if (rows.length === 0) return [];

  const qTokens = tokenize(query);
  if (qTokens.length === 0) return rows.slice(0, limit).map(r => toResult(r, 0));

  // Média de tamanho de documento
  const avgLen = rows.reduce((s, r) => s + (JSON.parse(r.tokens) as string[]).length, 0) / rows.length;

  const N = rows.length;

  // IDF por token
  const df: Record<string, number> = {};
  for (const row of rows) {
    const toks = new Set(JSON.parse(row.tokens) as string[]);
    for (const t of qTokens) { if (toks.has(t)) df[t] = (df[t] ?? 0) + 1; }
  }

  const scored = rows.map(row => {
    const toks = JSON.parse(row.tokens) as string[];
    const dl = toks.length;
    let score = 0;
    for (const t of qTokens) {
      const tf = toks.filter(x => x === t).length;
      if (tf === 0) continue;
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

function toResult(row: ExampleRow, score: number): SearchResult {
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
