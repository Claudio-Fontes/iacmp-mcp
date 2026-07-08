import { getDb } from './schema.js';
import { precomputeTokens } from './bm25.js';

export interface ExampleInput {
  id: string;
  title: string;
  provider: string;
  constructs: string[];
  tags: string[];
  content: {
    stacks: Record<string, string>;
    handlers: Record<string, string>;
    notes: string[];
  };
  validated?: boolean;
}

export function upsertExample(ex: ExampleInput): void {
  const db = getDb();
  const tokens = precomputeTokens({ title: ex.title, tags: ex.tags, constructs: ex.constructs, content: ex.content });
  db.prepare(`
    INSERT INTO examples (id, title, provider, constructs, tags, content, tokens, validated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, provider = excluded.provider,
      constructs = excluded.constructs, tags = excluded.tags,
      content = excluded.content, tokens = excluded.tokens,
      validated = excluded.validated
  `).run(
    ex.id, ex.title, ex.provider,
    JSON.stringify(ex.constructs),
    JSON.stringify(ex.tags),
    JSON.stringify(ex.content),
    JSON.stringify(tokens),
    ex.validated !== false ? 1 : 0,
  );
}

export function countExamples(): number {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as n FROM examples').get() as { n: number }).n;
}

export function listExamples(provider?: string): { id: string; title: string; provider: string; tags: string[] }[] {
  const db = getDb();
  const rows = provider
    ? db.prepare('SELECT id, title, provider, tags FROM examples WHERE provider = ? AND validated = 1').all(provider)
    : db.prepare('SELECT id, title, provider, tags FROM examples WHERE validated = 1').all();
  return (rows as { id: string; title: string; provider: string; tags: string }[]).map(r => ({
    ...r, tags: JSON.parse(r.tags),
  }));
}
