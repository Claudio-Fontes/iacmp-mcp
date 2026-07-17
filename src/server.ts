#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { startTransport, type TransportMode } from './transport/index.js';
import { handleSearchExamples, handleListExamples } from './tools/search-examples.js';
import { handleValidateStack } from './tools/validate-stack.js';
import { countExamples, ftsNeedsRebuild, rebuildFts } from './db/repository.js';
import { migrateStatic } from './seed/migrate-static.js';
import { dbPath } from './db/schema.js';

// Seed automático na primeira execução
if (countExamples() === 0) {
  const n = migrateStatic();
  process.stderr.write(`[iacmp-mcp] Banco inicializado: ${n} exemplos em ${dbPath()}\n`);
}

// Reconstrói o índice FTS se estiver defasado — cobre bancos criados antes da
// migração para FTS5 (que já têm exemplos mas o índice vazio).
if (ftsNeedsRebuild()) {
  const n = rebuildFts();
  process.stderr.write(`[iacmp-mcp] Índice de busca (FTS5) reconstruído: ${n} exemplos\n`);
}

const server = new Server(
  { name: 'iacmp-mcp', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_examples',
      description: 'Busca exemplos de stacks iacmp validados em deploy real. Use SEMPRE antes de gerar qualquer stack para ter um template grounded e evitar alucinações.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Ex: "DynamoDB CRUD", "S3 presigned URL", "Azure Cosmos Table"' },
          provider: { type: 'string', enum: ['aws', 'azure', 'gcp'], description: 'Filtrar por provider (opcional)' },
          limit: { type: 'number', description: 'Máximo de resultados (padrão: 3)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_examples',
      description: 'Lista todos os exemplos disponíveis no banco de conhecimento.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['aws', 'azure', 'gcp'], description: 'Filtrar por provider (opcional)' },
        },
      },
    },
    {
      name: 'validate_stack',
      description: 'Valida uma stack iacmp rodando o `iacmp synth` REAL (mesma verdade do deploy) — não heurísticas. Passe projectDir para validar no seu projeto (autoritativo, recomendado); sem ele, valida a stack isolada num scaffold. Use SEMPRE antes de aceitar uma stack gerada.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Conteúdo TypeScript da stack' },
          filename: { type: 'string', description: 'Caminho relativo do arquivo (ex: stacks/compute/api-stack.ts) — com projectDir, valida substituindo esse arquivo' },
          projectDir: { type: 'string', description: 'Diretório absoluto do projeto iacmp — validação autoritativa no projeto completo (recomendado)' },
          provider: { type: 'string', enum: ['aws', 'azure', 'gcp', 'terraform'], description: 'Provider alvo do synth (padrão: aws no modo isolado; o do iacmp.json com projectDir)' },
          handlers: { type: 'object', description: 'Código dos handlers referenciados pela stack, por caminho (ex: {"src/api.ts": "..."}). No modo isolado, valida o código do handler também (ex: @aws-sdk em Azure); ausentes viram stub vazio.' },
        },
        required: ['content'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result: string;
  switch (name) {
    case 'search_examples':
      result = handleSearchExamples(args as { query: string; provider?: string; limit?: number });
      break;
    case 'list_examples':
      result = handleListExamples(args as { provider?: string });
      break;
    case 'validate_stack':
      result = handleValidateStack(args as { content: string; filename?: string; projectDir?: string; provider?: string; handlers?: Record<string, string> });
      break;
    default:
      result = `Tool desconhecida: ${name}`;
  }
  return { content: [{ type: 'text', text: result }] };
});

const mode = (process.argv[2] as TransportMode) ?? 'stdio';
startTransport(server, mode).catch(err => {
  process.stderr.write(`Erro ao iniciar MCP server: ${err.message}\n`);
  process.exit(1);
});
