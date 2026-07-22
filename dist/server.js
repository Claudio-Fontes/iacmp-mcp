#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { startTransport } from './transport/index.js';
import { handleSearchExamples, handleListExamples } from './tools/search-examples.js';
import { handleValidateStack } from './tools/validate-stack.js';
import { handleWriteStack } from './tools/write-stack.js';
import { handleSynthProject, handleDeployProject, handleDestroyProject } from './tools/run-project.js';
import { handleReadSynthOutput } from './tools/read-synth-output.js';
import { countExamples, ftsNeedsRebuild, rebuildFts } from './db/repository.js';
import { migrateStatic } from './seed/migrate-static.js';
import { dbPath } from './db/schema.js';
// Seed inicial + SYNC automático a cada start do servidor: migrateStatic() faz
// upsert por id (idempotente) sobre os exemplos curados de src/knowledge/**.
// Roda SEMPRE, não só quando o banco está vazio — sem isso, qualquer fixture
// nova/editada no repo fica invisível pro search_examples/iacmp ai até alguém
// rodar o sync manualmente (gap real encontrado em 2026-07-22: 11 fixtures
// novas + 1 órfã de commit anterior ficaram fora do banco por dias). upsert
// nunca remove linhas — o banco tem ~230 exemplos de outras fontes (seed em
// lote); este passo só soma/atualiza os curados de ALL_EXAMPLES.
const wasEmpty = countExamples() === 0;
const n = migrateStatic();
process.stderr.write(wasEmpty
    ? `[iacmp-mcp] Banco inicializado: ${n} exemplos em ${dbPath()}\n`
    : `[iacmp-mcp] Knowledge base sincronizada: ${n} exemplos curados (upsert) em ${dbPath()}\n`);
// Reconstrói o índice FTS se estiver defasado — cobre bancos criados antes da
// migração para FTS5 (que já têm exemplos mas o índice vazio).
if (ftsNeedsRebuild()) {
    const n = rebuildFts();
    process.stderr.write(`[iacmp-mcp] Índice de busca (FTS5) reconstruído: ${n} exemplos\n`);
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
        {
            name: 'write_stack',
            description: 'Escreve um arquivo TypeScript de stack no projeto iacmp. Use para criar ou atualizar stacks antes de rodar synth_project.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectPath: { type: 'string', description: 'Caminho absoluto do projeto iacmp' },
                    filePath: { type: 'string', description: 'Caminho relativo do arquivo dentro do projeto (ex: stacks/main.ts)' },
                    content: { type: 'string', description: 'Conteúdo TypeScript da stack' },
                },
                required: ['projectPath', 'filePath', 'content'],
            },
        },
        {
            name: 'synth_project',
            description: 'Roda `iacmp synth` no projeto. Valida a stack, roda os guards e gera os templates (CloudFormation, Bicep, tf.json). Use depois de write_stack e antes de deploy_project.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectPath: { type: 'string', description: 'Caminho absoluto do projeto iacmp' },
                    provider: { type: 'string', enum: ['aws', 'azure', 'gcp', 'terraform'], description: 'Provider alvo (padrão: o do iacmp.json)' },
                },
                required: ['projectPath'],
            },
        },
        {
            name: 'deploy_project',
            description: 'Roda `iacmp deploy --yes` no projeto. Faz o deploy real na cloud. Requer que synth_project tenha passado antes.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectPath: { type: 'string', description: 'Caminho absoluto do projeto iacmp' },
                    provider: { type: 'string', enum: ['aws', 'azure', 'gcp', 'terraform'], description: 'Provider alvo (padrão: o do iacmp.json)' },
                },
                required: ['projectPath'],
            },
        },
        {
            name: 'destroy_project',
            description: 'Roda `iacmp destroy --yes` no projeto. Remove todos os recursos da cloud. Use com cautela — ação irreversível.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectPath: { type: 'string', description: 'Caminho absoluto do projeto iacmp' },
                    provider: { type: 'string', enum: ['aws', 'azure', 'gcp', 'terraform'], description: 'Provider alvo (padrão: o do iacmp.json)' },
                },
                required: ['projectPath'],
            },
        },
        {
            name: 'read_synth_output',
            description: 'Lê os arquivos gerados pelo synth (templates CloudFormation, Bicep, tf.json). Use para inspecionar o que será deployado antes de rodar deploy_project.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectPath: { type: 'string', description: 'Caminho absoluto do projeto iacmp' },
                    provider: { type: 'string', enum: ['aws', 'azure', 'gcp', 'terraform'], description: 'Provider cujos templates ler' },
                },
                required: ['projectPath', 'provider'],
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
        case 'write_stack':
            result = handleWriteStack(args);
            break;
        case 'synth_project':
            result = handleSynthProject(args);
            break;
        case 'deploy_project':
            result = handleDeployProject(args);
            break;
        case 'destroy_project':
            result = handleDestroyProject(args);
            break;
        case 'read_synth_output':
            result = handleReadSynthOutput(args);
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
