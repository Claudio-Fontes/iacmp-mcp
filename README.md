# iacmp-mcp

MCP server para o [iacmp](https://github.com/cme1o/iacmp) — expõe ferramentas de busca e execução de infraestrutura para qualquer AI com suporte a MCP (Claude no VS Code, Cursor, etc.).

## Instalação

```bash
npx -y @iacmp/mcp stdio
```

Ou globalmente:

```bash
npm install -g @iacmp/mcp
```

## Configuração

Adicione ao seu `~/.claude/settings.json` ou `.mcp.json` do projeto:

**Com npx (sem instalação prévia):**
```json
{
  "mcpServers": {
    "iacmp": {
      "command": "npx",
      "args": ["-y", "@iacmp/mcp", "stdio"]
    }
  }
}
```

**Com instalação global:**
```json
{
  "mcpServers": {
    "iacmp": {
      "command": "iacmp-mcp",
      "args": ["stdio"]
    }
  }
}
```

**Via Claude Code CLI:**
```bash
claude mcp add iacmp -- npx -y @iacmp/mcp stdio
```

## Ferramentas

### Busca e validação

| Ferramenta | Descrição |
|---|---|
| `search_examples` | Busca exemplos de stacks validados em deploy real (BM25 + FTS5) |
| `list_examples` | Lista todos os exemplos disponíveis por provider |
| `validate_stack` | Valida uma stack rodando `iacmp synth` real — não heurísticas |

### Execução

| Ferramenta | Descrição |
|---|---|
| `write_stack` | Escreve um arquivo TypeScript de stack no projeto |
| `synth_project` | Roda `iacmp synth` no projeto — valida e gera templates |
| `deploy_project` | Roda `iacmp deploy --yes` no projeto |
| `destroy_project` | Roda `iacmp destroy --yes` no projeto |
| `read_synth_output` | Lê os templates gerados (Bicep, CloudFormation, tf.json) |

## Fluxo de uso

Com as ferramentas de execução, qualquer AI com MCP conectado pode orquestrar o ciclo completo sem abrir terminal:

```
search_examples("serverless dynamodb azure")    → busca padrão no banco
write_stack({ projectPath, filePath, content }) → escreve a stack
synth_project({ projectPath, provider })        → valida + gera templates
read_synth_output({ projectPath, provider })    → inspeciona o Bicep/CFN gerado
deploy_project({ projectPath, provider })       → deploya na cloud
destroy_project({ projectPath, provider })      → remove os recursos
```

## Banco de conhecimento

O corpus de exemplos (126 stacks iacmp, parte validada em deploy real AWS/Azure) é a **fonte única versionada** e vive no pacote [`@iacmp/knowledge`](https://github.com/Claudio-Fontes/iacmp/tree/main/packages/knowledge) do monorepo — não neste repositório. Este servidor **consome** esse corpus: no boot, `ensureSeeded()` faz upsert dos exemplos no banco SQLite `~/.iacmp/knowledge.db` (idempotente, com gate por hash) e a busca usa FTS5 com boost para exemplos validados. O mesmo banco é lido pelo `iacmp ai` (RAG) — os dois front-ends compartilham a base. Corrigir um exemplo é um commit em `@iacmp/knowledge`.

## Pré-requisitos

- Node.js 18+
- [iacmp](https://github.com/cme1o/iacmp) instalado e no PATH (necessário para as ferramentas de execução)
- Credenciais de cloud configuradas (AWS CLI, Azure CLI) para deploy/destroy
