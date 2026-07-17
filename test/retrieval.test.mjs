// Teste de retrieval isolado — banco temporário via IACMP_MCP_DB.
// Prova: (1) não-validados são buscáveis; (2) boost desempata a favor do
// validado sem sobrepor relevância; (3) filtro de provider; (4) acentos pt-BR;
// (5) código da stack é indexado. Sem framework — asserts nativos.
import { strict as assert } from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

const tmp = path.join(os.tmpdir(), `iacmp-mcp-test-${process.pid}.db`);
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + suffix); } catch {} }
process.env.IACMP_MCP_DB = tmp;

const { upsertExample } = await import('../dist/db/repository.js');
const { search } = await import('../dist/db/bm25.js');
const { handleListExamples } = await import('../dist/tools/search-examples.js');

function ex(id, provider, validated, { title, tags = [], constructs = [], notes = [], stacks = {}, handlers = {} }) {
  upsertExample({ id, title, provider, constructs, tags, content: { stacks, handlers, notes }, validated });
}

// --- corpus de teste ---------------------------------------------------------
// twins: idênticos exceto por validated → provam o DESEMPATE pelo boost.
ex('twin-gen', 'aws', false, {
  title: 'DynamoDB CRUD',
  tags: ['aws', 'dynamodb', 'lambda'],
  constructs: ['Database.DynamoDB', 'Function.Lambda'],
  notes: ['crud simples em dynamodb'],
});
ex('twin-val', 'aws', true, {
  title: 'DynamoDB CRUD',
  tags: ['aws', 'dynamodb', 'lambda'],
  constructs: ['Database.DynamoDB', 'Function.Lambda'],
  notes: ['crud simples em dynamodb'],
});
// strong unvalidated vs weak validated → prova que RELEVÂNCIA DOMINA o boost.
ex('strong-gen', 'aws', false, {
  title: 'S3 presigned upload presigned url presigned',
  tags: ['aws', 's3', 'presigned', 'upload'],
  constructs: ['Storage.Bucket'],
  notes: ['presigned url para upload direto'],
});
ex('weak-val', 'aws', true, {
  title: 'RDS Postgres em VPC',
  tags: ['aws', 'rds', 'postgres', 'presigned'],
  constructs: ['Database.SQL'],
  notes: ['conexão via secret'],
});
ex('cosmos-azure', 'azure', false, {
  title: 'Cosmos Table CRUD',
  tags: ['azure', 'cosmos', 'functions'],
  constructs: ['Database.DynamoDB'],
  notes: ['getEntity retorna entidade flat, 404 lança RestError'],
});
ex('fila-sqs', 'aws', false, {
  title: 'Worker de fila com SQS',
  tags: ['aws', 'sqs', 'lambda', 'dlq'],
  constructs: ['Messaging.Queue'],
  notes: ['função de processamento assíncrono'],
});
// termo "presigned" só aparece no CÓDIGO da stack, não nas notes/tags:
ex('upload-code', 'aws', false, {
  title: 'Envio de arquivos',
  tags: ['aws', 's3', 'lambda'],
  constructs: ['Storage.Bucket'],
  notes: ['envio direto do browser'],
  handlers: { 'src/getUrl.ts': "import { getSignedUrl } from '@aws-sdk/s3-request-presigner';\nconst signed = await getSignedUrl(s3, cmd);" },
});

let pass = 0;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); pass++; };

// 1) NÃO-validado é buscável (o bug do gate validated=1) ----------------------
check('exemplo não-validado aparece na busca', () => {
  const r = search('cosmos table', { limit: 5 });
  assert.ok(r.some(x => x.id === 'cosmos-azure'), 'cosmos-azure (validated=false) deveria aparecer');
});

// 2a) boost desempata quase-empate a favor do validado -----------------------
check('entre matches equivalentes, o validado vem primeiro (twins)', () => {
  const r = search('dynamodb crud', { provider: 'aws', limit: 5 });
  const ids = r.map(x => x.id);
  assert.ok(ids.indexOf('twin-val') < ids.indexOf('twin-gen'),
    `validado deveria vir antes no empate. ordem: ${ids.join(', ')}`);
});

// 2b) relevância DOMINA o boost — match forte não-validado > validado fraco ---
check('match forte não-validado vence validado fraco (relevância domina)', () => {
  const r = search('presigned upload', { provider: 'aws', limit: 5 });
  const ids = r.map(x => x.id);
  assert.ok(ids.indexOf('strong-gen') < ids.indexOf('weak-val'),
    `strong-gen (não-validado, match forte) deveria vencer weak-val. ordem: ${ids.join(', ')}`);
});

// 3) filtro de provider isola aws de azure ------------------------------------
check('filtro provider=aws não traz azure', () => {
  const r = search('crud', { provider: 'aws', limit: 10 });
  assert.ok(!r.some(x => x.provider === 'azure'), 'nenhum azure com provider=aws');
});

// 4) acentos pt-BR: "função" casa com "funcao"/"função" -----------------------
check('busca com acento casa (função → fila-sqs)', () => {
  const r = search('função assíncrona', { limit: 5 });
  assert.ok(r.some(x => x.id === 'fila-sqs'), 'fila-sqs (nota tem "função assíncrona") deveria casar');
});

// 5) código da stack é indexado — "presigner" (de s3-request-presigner) só
//    existe no handler de upload-code, em nenhuma nota/tag/título ---------------
check('termo presente só no código é encontrado', () => {
  const r = search('presigner', { limit: 5 });
  assert.ok(r.some(x => x.id === 'upload-code'), 'upload-code deveria casar por "presigner" no código do handler');
});

// 6) list_examples mostra todos, com contagem validados/gerados ---------------
check('list_examples mostra validados e gerados', () => {
  const out = handleListExamples({});
  assert.ok(out.includes('Total: 7 exemplos'), 'total 7');
  assert.ok(out.includes('2 validados'), 'deveria contar 2 validados');
  assert.ok(out.includes('twin-gen'), 'não-validado deve aparecer na lista');
});

const TOTAL = 7;
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + suffix); } catch {} }
console.log(`\n${pass}/${TOTAL} testes passaram`);
process.exit(pass === TOTAL ? 0 : 1);
