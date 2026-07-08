#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { startTransport } from './transport/index.js';
import { handleSearchExamples, handleListExamples } from './tools/search-examples.js';
import { handleValidateStack } from './tools/validate-stack.js';
import { countExamples } from './db/repository.js';
import { migrateStatic } from './seed/migrate-static.js';
import { dbPath } from './db/schema.js';
// Seed automático na primeira execução
if (countExamples() === 0) {
    const n = migrateStatic();
    process.stderr.write(`[iacmp-mcp] Banco inicializado: ${n} exemplos em ${dbPath()}\n`);
}
const server = new Server({ name: 'iacmp-mcp', version: '0.2.0' }, { capabilities: { tools: {} } });
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
            description: 'Valida o conteúdo de uma stack iacmp. Detecta erros comuns: ref() como string, resources inválidos, SDK v2, objeto ref interno exposto. Com projectDir roda iacmp synth completo.',
            inputSchema: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'Conteúdo TypeScript da stack' },
                    filename: { type: 'string', description: 'Caminho relativo (ex: stacks/compute/api-stack.ts)' },
                    projectDir: { type: 'string', description: 'Diretório absoluto do projeto para synth completo (opcional)' },
                },
                required: ['content'],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    let result;
    switch (name) {
        case 'search_examples':
            result = handleSearchExamples(args);
            break;
        case 'list_examples':
            result = handleListExamples(args);
            break;
        case 'validate_stack':
            result = handleValidateStack(args);
            break;
        default:
            result = `Tool desconhecida: ${name}`;
    }
    return { content: [{ type: 'text', text: result }] };
});
const mode = process.argv[2] ?? 'stdio';
startTransport(server, mode).catch(err => {
    process.stderr.write(`Erro ao iniciar MCP server: ${err.message}\n`);
    process.exit(1);
});
