// Harness de TESTES DE CONTRATO — nível rápido, sem nuvem, sem custo.
//
// Roda `iacmp synth` real (sem deploy) contra os 9 exemplos curados de
// src/knowledge/index.ts e afirma invariantes semânticas sobre o resultado.
// Cada exemplo usa um projeto de scaffold TEMPORÁRIO (mkdtemp), criado com
// `iacmp init` (mesmo mecanismo real do CLI — não reinventa scaffold) e
// REMOVIDO ao final da execução (sucesso ou falha).
//
// Requer o CLI `iacmp` no PATH — pula com exit 0 se ausente.
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

try {
  execSync('iacmp --version', { stdio: 'pipe' });
} catch {
  console.log('SKIP: CLI `iacmp` não está no PATH — harness de contrato ignorado.');
  process.exit(0);
}

// Fonte: 'curados' (ALL_EXAMPLES estático, default) ou 'db' (os 242 do banco
// vivo que o search_examples/iacmp ai REALMENTE usam). IACMP_CONTRACT_SOURCE=db.
const SOURCE = process.env.IACMP_CONTRACT_SOURCE === 'db' ? 'db' : 'curados';
let ALL_EXAMPLES;
if (SOURCE === 'db') {
  const { getDb } = await import('../dist/db/schema.js');
  const rows = getDb().prepare('SELECT id, title, provider, tags, content, validated FROM examples').all();
  ALL_EXAMPLES = rows.map(r => {
    const c = JSON.parse(r.content);
    return {
      id: r.id, title: r.title, provider: r.provider,
      tags: JSON.parse(r.tags), stacks: c.stacks ?? {}, handlers: c.handlers ?? {},
      notes: c.notes ?? [], validated: !!r.validated,
    };
  });
} else {
  ({ ALL_EXAMPLES } = await import('../dist/knowledge/index.js'));
}

// ── Scaffold temporário (mkdtemp), limpo no final ───────────────────────────
// Pasta dedicada para o scaffolding efêmero desta execução (higiene: nunca em
// ~/Projetos nem dentro de repos). Override via IACMP_BATTERY_RUNS_DIR.
const RUNS_DIR = process.env.IACMP_BATTERY_RUNS_DIR
  ?? '/private/tmp/claude-501/-Users-cmelo-Projetos-iacmp/f8e34d2a-ea76-4ea2-a355-5a29fcc3efc7/scratchpad/harness-runs';
fs.mkdirSync(RUNS_DIR, { recursive: true });
const SCRATCH_ROOT = fs.mkdtempSync(path.join(RUNS_DIR, 'run-'));
const PROJECT_DIR = path.join(SCRATCH_ROOT, 'proj');

function cleanup() {
  fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  try { fs.rmdirSync(RUNS_DIR); } catch { /* não-vazio (outra run concorrente) — ok deixar */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

function run(cmd, cwd, timeout = 60000) {
  try {
    const out = execSync(cmd, { cwd, timeout }).toString();
    return { ok: true, output: out };
  } catch (err) {
    const output = ((err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')).trim() || err.message;
    return { ok: false, output };
  }
}

console.log(`Scaffold temporário: ${SCRATCH_ROOT}`);
const init = run(`iacmp init ${path.basename(PROJECT_DIR)}`, SCRATCH_ROOT, 120000);
if (!init.ok) {
  console.error('BLOQUEIO: `iacmp init` falhou — não é possível rodar o harness.\n' + init.output);
  process.exit(1);
}

function resetProject() {
  for (const d of ['stacks', 'src', 'synth-out']) {
    fs.rmSync(path.join(PROJECT_DIR, d), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(PROJECT_DIR, 'stacks'), { recursive: true });
  fs.mkdirSync(path.join(PROJECT_DIR, 'src'), { recursive: true });
}

function writeFiles(base, files) {
  for (const [rel, content] of Object.entries(files ?? {})) {
    const dest = path.join(base, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf-8');
  }
}

function providerOutDir(provider) {
  return path.join(PROJECT_DIR, 'synth-out', provider);
}

function readOutputFiles(provider) {
  const dir = providerOutDir(provider);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isFile())
    .map(f => ({ name: f, path: path.join(dir, f), content: fs.readFileSync(path.join(dir, f), 'utf-8') }));
}

// ── Helpers de extração (regex simples sobre o texto-fonte dos exemplos) ────

function extractConstructTypes(stacksSrc) {
  const map = new Map();
  for (const m of stacksSrc.matchAll(/new\s+([\w.]+)\(\s*stack\s*,\s*'([^']+)'/g)) {
    map.set(m[2], m[1]);
  }
  return map;
}

function extractLocalObjectLiterals(src) {
  const vars = new Map();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(\{[^{}]*\})\s*;/g)) {
    vars.set(m[1], m[2]);
  }
  return vars;
}

const RUNTIME_PROVIDED = /^(AWS_|_|LAMBDA_|NODE_ENV$|TZ$)/;

function extractUsedEnvVars(handlersSrc) {
  const used = new Set();
  for (const m of handlersSrc.matchAll(/process\.env(?:\.(\w+)|\[['"]([^'"]+)['"]\])/g)) {
    const name = m[1] ?? m[2];
    if (name && !RUNTIME_PROVIDED.test(name)) used.add(name);
  }
  return used;
}

// Espelha (só leitura, sem tocar no iacmp) a exceção de auto-inject do Azure
// synth documentada em packages/cli/src/validators/index.ts (AZURE_AUTO_INJECTED_BASE):
// MONGO_URI/DB_NAME quando a Lambda referencia Database.DynamoDB, e
// `${chave}_CONNECTION_STRING` quando a env var é ref(bucket, 'Name').
function extractDeclaredEnvKeys(stacksSrc) {
  const locals = extractLocalObjectLiterals(stacksSrc);
  const constructTypes = extractConstructTypes(stacksSrc);
  const keys = new Set();
  const autoInjectExtra = new Set();

  for (const m of stacksSrc.matchAll(/environment:\s*(\{[^{}]*\}|\w+)/g)) {
    let block = m[1];
    if (!block.startsWith('{')) block = locals.get(block) ?? '';
    for (const km of block.matchAll(/(\w+)\s*:\s*([^,{}]+)/g)) {
      const key = km[1];
      const val = km[2].trim();
      keys.add(key);
      const refMatch = val.match(/ref\(\s*['"]([^'"]+)['"]\s*,\s*['"]Name['"]\s*\)/);
      if (refMatch && constructTypes.get(refMatch[1]) === 'Storage.Bucket') {
        autoInjectExtra.add(`${key}_CONNECTION_STRING`);
      }
    }
  }
  return { keys, autoInjectExtra };
}

// ── Invariantes ──────────────────────────────────────────────────────────────
// Cada função recebe (ex, ctx) e retorna { status: 'PASS'|'FAIL'|'N/A', detail? }
// ctx = { provider, synthOk, synthOutput, outputFiles, stacksSrc, handlersSrc }

const INVARIANTS = [
  {
    id: 'synth-ok',
    check(ex, ctx) {
      if (ctx.synthOk) return { status: 'PASS' };
      return { status: 'FAIL', detail: ctx.synthOutput.split('\n').slice(0, 6).join(' | ') };
    },
  },
  {
    id: 'env-vars',
    check(ex, ctx) {
      const used = extractUsedEnvVars(ctx.handlersSrc);
      if (used.size === 0) return { status: 'PASS' };
      const { keys, autoInjectExtra } = extractDeclaredEnvKeys(ctx.stacksSrc);
      const autoInjected = ctx.provider === 'azure'
        ? new Set(['MONGO_URI', 'DB_NAME', ...autoInjectExtra])
        : new Set();
      const missing = [...used].filter(k => !keys.has(k) && !autoInjected.has(k)).sort();
      if (missing.length === 0) return { status: 'PASS' };
      return { status: 'FAIL', detail: `handler usa process.env.${missing.join('/')} sem declaração em nenhum construct` };
    },
  },
  {
    id: 'azure-dynamodb-mongo',
    check(ex, ctx) {
      if (!(ex.tags.includes('azure') && ex.tags.includes('dynamodb'))) return { status: 'N/A' };
      const bicep = ctx.outputFiles.filter(f => f.name.endsWith('.bicep') && !f.name.startsWith('_'))
        .map(f => f.content).join('\n');
      const hasMongoKind = /kind:\s*'MongoDB'/.test(bicep);
      const hasTableLeak = /EnableTable|GlobalDocumentDB/.test(bicep);
      if (hasMongoKind && !hasTableLeak) return { status: 'PASS' };
      return {
        status: 'FAIL',
        detail: `kind:'MongoDB' presente=${hasMongoKind}; EnableTable/GlobalDocumentDB presente=${hasTableLeak}`,
      };
    },
  },
  {
    id: 'azure-redis-enterprise',
    check(ex, ctx) {
      const hasRedis = [...extractConstructTypes(ctx.stacksSrc).values()].includes('Cache.Redis');
      if (!(ex.tags.includes('azure') && hasRedis)) return { status: 'N/A' };
      const bicep = ctx.outputFiles.filter(f => f.name.endsWith('.bicep') && !f.name.startsWith('_'))
        .map(f => f.content).join('\n');
      const hasEnterprise = /redisEnterprise/.test(bicep);
      const hasClassic = /Microsoft\.Cache\/redis['"@]/.test(bicep) || /Microsoft\.Cache\/redis@/.test(bicep);
      const hasTlsConn = /:10000/.test(bicep) || /rediss:\/\//.test(bicep);
      if (hasEnterprise && !hasClassic && hasTlsConn) return { status: 'PASS' };
      return {
        status: 'FAIL',
        detail: `redisEnterprise=${hasEnterprise}; Microsoft.Cache/redis clássico=${hasClassic}; :10000/rediss://=${hasTlsConn}`,
      };
    },
  },
  {
    id: 'no-stale-tables-sdk',
    check(ex, ctx) {
      if (!ex.tags.includes('azure')) return { status: 'N/A' };
      const hasDataTables = /@azure\/data-tables/.test(ctx.handlersSrc) || /\bTableClient\b/.test(ctx.handlersSrc);
      if (!hasDataTables) return { status: 'PASS' };
      return { status: 'FAIL', detail: 'handler importa @azure/data-tables ou TableClient (drift da migração Table→Mongo API)' };
    },
  },
  {
    id: 'refs-resolvem',
    check(ex, ctx) {
      const bad = ctx.outputFiles.find(f => f.content.includes('[object Object]') || f.content.includes('\x00'));
      if (!bad) return { status: 'PASS' };
      return { status: 'FAIL', detail: `${bad.name} contém [object Object] ou byte nulo` };
    },
  },
  {
    id: 'bicep-wiring',
    check(ex, ctx) {
      if (!(ctx.provider === 'azure' && Object.keys(ex.stacks).length > 1)) return { status: 'N/A' };
      const main = ctx.outputFiles.find(f => f.name === '_main.bicep');
      if (!main) return { status: 'FAIL', detail: '_main.bicep ausente para projeto azure multi-stack' };

      const moduleFile = new Map(); // sym -> fileName
      for (const m of main.content.matchAll(/module\s+(\w+)\s+'([^']+)'\s*=\s*\{/g)) {
        moduleFile.set(m[1], m[2]);
      }
      const byName = new Map(ctx.outputFiles.map(f => [f.name, f.content]));
      const problems = [];
      for (const m of main.content.matchAll(/^\s*(\w+):\s*(\w+)\.outputs\.(\w+)/gm)) {
        const [, paramName, sym, outputName] = m;
        const fileName = moduleFile.get(sym);
        if (!fileName) { problems.push(`${paramName}: módulo "${sym}" não declarado`); continue; }
        const content = byName.get(fileName);
        if (!content) { problems.push(`${paramName}: arquivo "${fileName}" do módulo "${sym}" não encontrado`); continue; }
        if (!new RegExp(`^output\\s+${outputName}\\b`, 'm').test(content)) {
          problems.push(`${paramName}: ${sym}.outputs.${outputName} não existe em ${fileName}`);
        }
      }
      if (problems.length === 0) return { status: 'PASS' };
      return { status: 'FAIL', detail: problems.join('; ') };
    },
  },
  {
    // Bug #6: "declarou privado, gerou público". Database.SQL com subnetIds no
    // Azure DEVE virar Postgres com delegatedSubnetResourceId e SEM firewall
    // pública (0.0.0.0). O synth passa mesmo se ignorar subnetIds — só o deploy
    // (ou este check) pega a infra pública silenciosa.
    id: 'azure-db-private',
    check(ex, ctx) {
      if (ctx.provider !== 'azure') return { status: 'N/A' };
      if (!(/Database\.SQL/.test(ctx.stacksSrc) && /subnetIds/.test(ctx.stacksSrc))) return { status: 'N/A' };
      const bicep = ctx.outputFiles.filter(f => f.name.endsWith('.bicep') && !f.name.startsWith('_')).map(f => f.content).join('\n');
      const hasDelegatedSubnet = /delegatedSubnetResourceId/.test(bicep);
      const hasPublicFirewall = /0\.0\.0\.0/.test(bicep);
      if (hasDelegatedSubnet && !hasPublicFirewall) return { status: 'PASS' };
      return { status: 'FAIL', detail: `delegatedSubnetResourceId=${hasDelegatedSubnet}; firewall pública 0.0.0.0=${hasPublicFirewall}` };
    },
  },
  {
    // Bug #13: subnet do Container App Environment PRECISA de delegation
    // Microsoft.App/environments (o ARM 2023-05-01 exige, apesar da doc). Sem
    // ela o synth passa mas o deploy falha em preflight.
    id: 'azure-cae-delegation',
    check(ex, ctx) {
      if (ctx.provider !== 'azure') return { status: 'N/A' };
      if (!(/Compute\.Container/.test(ctx.stacksSrc) && /subnetIds/.test(ctx.stacksSrc))) return { status: 'N/A' };
      const bicep = ctx.outputFiles.filter(f => f.name.endsWith('.bicep') && !f.name.startsWith('_')).map(f => f.content).join('\n');
      const hasCaeDelegation = /Microsoft\.App\/environments/.test(bicep) && /delegations/.test(bicep);
      if (hasCaeDelegation) return { status: 'PASS' };
      return { status: 'FAIL', detail: 'subnet do Container App sem delegation Microsoft.App/environments' };
    },
  },
  {
    // Porta/host/URL de infra hardcoded numa env var (deve ser ref()). Regra de
    // parada explícita da bateria — REDIS_PORT: '6379' etc.
    id: 'no-hardcoded-conn',
    check(ex, ctx) {
      const offenders = [];
      for (const m of ctx.stacksSrc.matchAll(/(\w+):\s*'([^']*)'/g)) {
        const [, key, val] = m;
        if (!/PORT|HOST|URL|URI|ENDPOINT|CONNECTION/i.test(key)) continue;
        if (/^(6379|5432|27017|3306|10000)$/.test(val) || /:\/\//.test(val)) offenders.push(`${key}='${val}'`);
      }
      if (offenders.length === 0) return { status: 'PASS' };
      return { status: 'FAIL', detail: `hardcoded (use ref()): ${offenders.join(', ')}` };
    },
  },
];

// ── Matriz de cobertura (20 cenários × 2 clouds) ────────────────────────────
// Palavras-chave casadas contra tags+title de cada exemplo. Mostra o caminho
// para as centenas: quais cenários já têm fixture e quais faltam.
const SCENARIO_MATRIX = [
  { n: 1, name: 'CRUD + RDS/SQL + CDN', kw: ['rds', 'postgres', 'cloudfront', 'cdn'] },
  { n: 2, name: 'CRUD serverless (Dynamo/Cosmos)', kw: ['dynamodb', 'cosmos'] },
  { n: 3, name: 'Worker de fila', kw: ['sqs', 'service-bus', 'queue', 'worker'] },
  { n: 4, name: 'Storage + CORS/presigned', kw: ['s3', 'blob', 'presigned', 'sas', 'cors'] },
  { n: 5, name: 'Agendamento (cron)', kw: ['eventbridge', 'schedule', 'cron', 'timer'] },
  { n: 6, name: 'Site estático + CDN/OAC', kw: ['static-site', 'website', 'oac'] },
  { n: 7, name: 'Fan-out (SNS→SQS / topic)', kw: ['sns', 'fanout', 'topic'] },
  { n: 8, name: 'API + cache Redis', kw: ['redis', 'cache', 'elasticache', 'redisenterprise'] },
  { n: 9, name: 'DB privado em VPC/VNet', kw: ['vpc', 'vnet', 'private', 'lambda-vpc'] },
  { n: 10, name: 'Container + LB + autoscale', kw: ['fargate', 'container-apps', 'alb', 'ingress'] },
  { n: 11, name: 'Trigger de storage', kw: ['s3-lambda-trigger', 'blob-trigger', 'event-grid'] },
  { n: 12, name: 'JWT Authorizer', kw: ['jwt', 'authorizer'] },
  { n: 13, name: 'Monitor + alerta', kw: ['cloudwatch', 'monitor', 'alarm', 'action-group'] },
  { n: 14, name: 'Workflow (Step/Logic)', kw: ['step-functions', 'logic-apps', 'workflow', 'durable'] },
  { n: 15, name: 'WAF', kw: ['waf', 'front-door', 'app-gateway'] },
  { n: 16, name: 'DocumentDB / Mongo', kw: ['documentdb', 'mongodb', 'mongo'] },
  { n: 17, name: 'Stream (Kinesis/Event Hubs)', kw: ['kinesis', 'event-hubs', 'stream'] },
  { n: 18, name: 'Secrets multi-ambiente', kw: ['secrets', 'key-vault', 'secrets-manager', 'config'] },
  { n: 19, name: 'WebSocket', kw: ['websocket', 'web-pubsub'] },
  { n: 20, name: 'Microsserviço composto', kw: ['microservice', 'microsservico'] },
];

function coverageReport() {
  const covered = { aws: new Map(), azure: new Map() };
  for (const ex of ALL_EXAMPLES) {
    const cloud = ex.tags.includes('azure') ? 'azure' : 'aws';
    const hay = [ex.title, ...ex.tags].join(' ').toLowerCase();
    for (const s of SCENARIO_MATRIX) {
      if (s.kw.some(k => hay.includes(k))) {
        const list = covered[cloud].get(s.n) ?? [];
        list.push(ex.id);
        covered[cloud].set(s.n, list);
      }
    }
  }
  console.log('\n=== Cobertura da matriz (20 cenários × 2 clouds) ===');
  let awsCov = 0, azCov = 0;
  for (const s of SCENARIO_MATRIX) {
    const a = covered.aws.get(s.n), z = covered.azure.get(s.n);
    if (a) awsCov++; if (z) azCov++;
    console.log(`${String(s.n).padStart(2)} ${col(s.name, 34)} AWS:${a ? '✓' : '·'}  Azure:${z ? '✓' : '·'}`);
  }
  console.log(`\nCobertura por fixture: AWS ${awsCov}/20 · Azure ${azCov}/20 (as lacunas "·" são os próximos fixtures a autorar).`);
}

// ── Execução ─────────────────────────────────────────────────────────────────

const results = []; // { id, title, provider, rows: { invId: {status, detail} } }

for (const ex of ALL_EXAMPLES) {
  const provider = ex.provider ?? (ex.tags.includes('azure') ? 'azure' : 'aws');
  if (provider !== 'aws' && provider !== 'azure') continue; // gcp/multi fora do escopo do diagnóstico
  resetProject();
  writeFiles(PROJECT_DIR, ex.stacks);
  writeFiles(PROJECT_DIR, ex.handlers);

  const synth = run(`iacmp synth --provider ${provider}`, PROJECT_DIR);
  const ctx = {
    provider,
    synthOk: synth.ok,
    synthOutput: synth.output,
    outputFiles: readOutputFiles(provider),
    stacksSrc: Object.values(ex.stacks).join('\n'),
    handlersSrc: Object.values(ex.handlers).join('\n'),
  };

  const rows = {};
  for (const inv of INVARIANTS) rows[inv.id] = inv.check(ex, ctx);
  results.push({ id: ex.id, title: ex.title, provider, rows });
}

// ── Relatório ────────────────────────────────────────────────────────────────

const invIds = INVARIANTS.map(i => i.id);
const col = (s, w) => String(s).padEnd(w).slice(0, w);
console.log(`\n=== Harness de contrato — ${results.length} exemplos (fonte: ${SOURCE}) × ${invIds.length} invariantes ===\n`);

const idW = Math.max(...results.map(r => r.id.length), 'exemplo'.length) + 1;
console.log(col('exemplo', idW) + invIds.map(i => col(i, 22)).join(''));
for (const r of results) {
  console.log(col(r.id, idW) + invIds.map(i => col(r.rows[i].status, 22)).join(''));
}

console.log('\n--- Falhas (detalhe, até 30) ---');
let failCount = 0, shown = 0;
for (const r of results) {
  for (const invId of invIds) {
    const row = r.rows[invId];
    if (row.status === 'FAIL') {
      failCount++;
      if (shown++ < 30) console.log(`FAIL ${r.id} / ${invId}: ${row.detail}`);
    }
  }
}
if (failCount === 0) console.log('(nenhuma)');
else if (failCount > 30) console.log(`... +${failCount - 30} falha(s) a mais`);

console.log('\n--- Falhas por invariante (fail/aplicável) ---');
for (const invId of invIds) {
  let fail = 0, applic = 0;
  for (const r of results) {
    const s = r.rows[invId].status;
    if (s !== 'N/A') applic++;
    if (s === 'FAIL') fail++;
  }
  console.log(`${col(invId, 24)} ${fail}/${applic}`);
}

const exFail = results.filter(r => invIds.some(i => r.rows[i].status === 'FAIL'));
console.log(`\n${results.length} exemplos · ${exFail.length} com ≥1 falha · ${results.length - exFail.length} limpos · ${failCount} falha(s) totais.`);

if (process.env.IACMP_CONTRACT_DUMP) {
  const dump = results.map(r => ({
    id: r.id, provider: r.provider,
    synthOk: r.rows['synth-ok'].status === 'PASS',
    reason: (r.rows['synth-ok'].detail ?? '').replace(/\s+/g, ' ').slice(0, 160),
  }));
  fs.writeFileSync(process.env.IACMP_CONTRACT_DUMP, JSON.stringify(dump, null, 2));
  console.log(`\nDump escrito: ${process.env.IACMP_CONTRACT_DUMP}`);
}

coverageReport();

process.exit(failCount === 0 ? 0 : 1);
