#!/usr/bin/env node
// Sync manual da knowledge base — mesma operação que o server.ts roda a cada
// start (upsert idempotente de ALL_EXAMPLES em ~/.iacmp/knowledge.db), exposta
// como comando standalone (`npm run sync`) pra quem quiser sincronizar sem
// subir o servidor MCP inteiro.
import { countExamples } from '../db/repository.js';
import { migrateStatic } from './migrate-static.js';
import { dbPath } from '../db/schema.js';
const before = countExamples();
const n = migrateStatic();
const after = countExamples();
console.log(`Knowledge base sincronizada: ${n} exemplos curados (upsert) em ${dbPath()}`);
console.log(`Total no banco: ${before} -> ${after}`);
