// Script para inserir batch de exemplos JSON no banco
// Uso: node dist/seed/insert-batch.js <arquivo.json>
import * as fs from 'fs';
import { upsertExample, countExamples } from '../db/repository.js';

const file = process.argv[2];
if (!file) { console.error('Uso: node dist/seed/insert-batch.js <arquivo.json>'); process.exit(1); }

const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as any[];
let inserted = 0, skipped = 0;

for (const ex of raw) {
  if (!ex.id || !ex.title || !ex.provider || !ex.stacks) { skipped++; continue; }
  try {
    upsertExample({
      id: ex.id,
      title: ex.title,
      provider: ex.provider,
      constructs: ex.constructs ?? [],
      tags: ex.tags ?? [],
      content: { stacks: ex.stacks ?? {}, handlers: ex.handlers ?? {}, notes: ex.notes ?? [] },
      validated: false, // gerado por IA, não validado em deploy real
    });
    inserted++;
  } catch { skipped++; }
}

console.log(`Inseridos: ${inserted} | Ignorados: ${skipped} | Total no banco: ${countExamples()}`);
