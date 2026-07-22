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

const { ALL_EXAMPLES } = await import('../dist/knowledge/index.js');

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
];

// ── Execução ─────────────────────────────────────────────────────────────────

const results = []; // { id, title, provider, rows: { invId: {status, detail} } }

for (const ex of ALL_EXAMPLES) {
  const provider = ex.tags.includes('azure') ? 'azure' : 'aws';
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
console.log('\n=== Harness de contrato — 9 exemplos curados ===\n');

const col = (s, w) => s.padEnd(w).slice(0, w);
const idW = Math.max(...results.map(r => r.id.length), 'exemplo'.length) + 1;
console.log(col('exemplo', idW) + invIds.map(i => col(i, 22)).join(''));
for (const r of results) {
  console.log(col(r.id, idW) + invIds.map(i => col(r.rows[i].status, 22)).join(''));
}

console.log('\n--- Falhas (detalhe) ---');
let failCount = 0;
for (const r of results) {
  for (const invId of invIds) {
    const row = r.rows[invId];
    if (row.status === 'FAIL') {
      failCount++;
      console.log(`FAIL ${r.id} / ${invId}: ${row.detail}`);
    }
  }
}
if (failCount === 0) console.log('(nenhuma)');

console.log(`\n${results.length} exemplos, ${failCount} falha(s) de invariante.`);
process.exit(failCount === 0 ? 0 : 1);
