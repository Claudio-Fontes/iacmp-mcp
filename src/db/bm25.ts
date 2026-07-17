// Busca da knowledge base — delega ao retrieval canônico de @iacmp/knowledge
// (FTS5 + boost de validated), compartilhado com o CLI (packages/ai). Este
// módulo só adapta o resultado ao formato SearchResult do servidor MCP.

import { getDb, type ExampleRow } from './schema.js';
import { searchExamples, tokenize, type ScoredExample } from '@iacmp/knowledge';

// LEGADO: alimenta a coluna examples.tokens (não usada pela busca). Reusa o
// tokenizer da fonte única para não divergir.
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
  validated: boolean;
  score: number;
}

export function search(query: string, opts: { provider?: string; limit?: number } = {}): SearchResult[] {
  const { provider, limit = 5 } = opts;
  const scored = searchExamples(getDb(), query, { provider, limit });
  if (!scored) return []; // FTS não pronto (o server reconstrói na inicialização)
  return scored.map(toResult);
}

function toResult(row: ScoredExample): SearchResult {
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

// Mantido para compatibilidade de tipos com quem importa ExampleRow daqui.
export type { ExampleRow };
