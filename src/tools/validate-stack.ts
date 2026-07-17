import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Validação AUTORITATIVA: roda o `iacmp synth` real — a mesma verdade que o
// deploy usa — em vez de heurísticas de string que divergem do pipeline. Dois
// modos: no projeto do cliente (projectDir) ou num scaffold cacheado isolado.

const SCAFFOLD_DIR = path.join(os.homedir(), '.iacmp', 'mcp-scaffold');
const VALIDATE_FILE = 'stacks/_mcp_validate.ts';

function runSynth(cwd: string, provider?: string): { ok: boolean; output: string } {
  try {
    const flag = provider ? ` --provider ${provider}` : '';
    const out = execSync(`iacmp synth${flag} 2>&1`, { cwd, timeout: 60000 }).toString().trim();
    return { ok: true, output: out };
  } catch (err: any) {
    const output = ((err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')).trim() || err.message;
    return { ok: false, output };
  }
}

// Garante o scaffold cacheado (iacmp init instala tsx/typescript/@iacmp/core
// corretamente). Custo único ~3s; reusado nas chamadas seguintes. Retorna o
// diretório, ou null se o CLI `iacmp` não estiver disponível.
function ensureScaffold(): string | null {
  if (!fs.existsSync(path.join(SCAFFOLD_DIR, 'iacmp.json'))) {
    try {
      fs.rmSync(SCAFFOLD_DIR, { recursive: true, force: true });
      execSync(`iacmp init ${path.basename(SCAFFOLD_DIR)}`, {
        cwd: path.dirname(SCAFFOLD_DIR), timeout: 120000, stdio: 'pipe',
      });
    } catch {
      return null;
    }
  }
  return fs.existsSync(path.join(SCAFFOLD_DIR, 'iacmp.json')) ? SCAFFOLD_DIR : null;
}

// Extrai os módulos de handler referenciados na stack (ex: handler: 'src/api.handler'
// → src/api.ts). Usado para criar stubs no scaffold e não falhar por arquivo ausente.
function referencedHandlerStems(content: string): string[] {
  const stems = new Set<string>();
  for (const m of content.matchAll(/handler:\s*['"]([^'"]+)['"]/g)) {
    const mod = m[1].replace(/\.[^.]+$/, '');                 // tira a export (.handler)
    const stem = mod.replace(/^(\.\/)?(dist|src)\//, '');     // tira prefixo dist/src
    if (stem) stems.add(stem);
  }
  return [...stems];
}

export function handleValidateStack(args: {
  content: string; filename?: string; projectDir?: string; provider?: string;
  handlers?: Record<string, string>;
}): string {
  const { content, filename, projectDir, provider, handlers } = args;

  // Modo 1 — projeto real do cliente: synth autoritativo no lugar.
  if (projectDir && fs.existsSync(projectDir)) {
    const rel = filename ?? VALIDATE_FILE;
    const filePath = path.join(projectDir, rel);
    const existed = fs.existsSync(filePath);
    const backup = existed ? fs.readFileSync(filePath, 'utf-8') : null;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      const { ok, output } = runSynth(projectDir, provider);
      return ok
        ? `✓ Synth válido (projeto real: ${projectDir})\n${output}`
        : `✗ Synth falhou (validação autoritativa):\n${output}`;
    } finally {
      if (backup !== null) fs.writeFileSync(filePath, backup, 'utf-8');
      else if (!existed) { try { fs.unlinkSync(filePath); } catch { /* ignore */ } }
    }
  }

  // Modo 2 — standalone: scaffold cacheado + synth isolado (só esta stack).
  const scaffold = ensureScaffold();
  if (!scaffold) {
    return '⚠ Não foi possível validar: o CLI "iacmp" não está no PATH deste ambiente.\n' +
      'Para validação autoritativa, forneça "projectDir" (o diretório do seu projeto iacmp) ou instale o iacmp.';
  }
  const stacksDir = path.join(scaffold, 'stacks');
  const srcDir = path.join(scaffold, 'src');
  const filePath = path.join(scaffold, VALIDATE_FILE);
  try {
    // Isola: só a stack em validação (remove stacks/handlers do template ou de
    // uma chamada anterior).
    fs.rmSync(stacksDir, { recursive: true, force: true });
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.mkdirSync(stacksDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');

    // Handlers fornecidos pelo cliente (valida o código real — ex: @aws-sdk em Azure).
    const provided = new Set<string>();
    for (const [p, code] of Object.entries(handlers ?? {})) {
      const dest = path.join(scaffold, p.startsWith('src/') || p.startsWith('dist/') ? p : path.join('src', p));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, code, 'utf-8');
      provided.add(path.basename(dest).replace(/\.(ts|js)$/, ''));
    }
    // Stub vazio para handlers referenciados mas não fornecidos (senão o synth
    // falha por "arquivo de origem ausente", ruído alheio à stack).
    for (const stem of referencedHandlerStems(content)) {
      const stub = path.join(srcDir, `${stem}.ts`);
      if (!fs.existsSync(stub) && !provided.has(path.basename(stem))) {
        fs.mkdirSync(path.dirname(stub), { recursive: true });
        fs.writeFileSync(stub, 'export const handler = async () => ({ statusCode: 200, body: "" });\n', 'utf-8');
      }
    }

    const { ok, output } = runSynth(scaffold, provider ?? 'aws');
    const header = ok ? '✓ Synth válido' : '✗ Synth falhou';
    const note = handlers
      ? ''
      : ' (handlers ausentes viraram stubs vazios — passe "handlers" para validar o código deles também)';
    return `${header} — synth isolado como provider=${provider ?? 'aws'}${note}. Refs a outras stacks ` +
      `não presentes aparecem como erro; para o projeto completo passe projectDir.\n${output}`;
  } finally {
    try { fs.rmSync(filePath, { force: true }); } catch { /* ignore */ }
  }
}
