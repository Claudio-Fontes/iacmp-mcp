import { execSync } from 'child_process';
import * as path from 'path';

const ALLOWED_CMDS = new Set(['synth', 'deploy', 'destroy']);

// Timeout generoso para deploy Azure (APIM + Cosmos podem levar ~10min).
const TIMEOUT_MS: Record<string, number> = {
  synth: 90_000,
  deploy: 0, // 0 = sem timeout — aguarda o CloudFormation completar independente do tempo
  destroy: 600_000,
};

export interface ExecResult {
  ok: boolean;
  output: string;
}

export function runIacmp(cmd: string, args: string[], cwd: string): ExecResult {
  if (!ALLOWED_CMDS.has(cmd)) {
    return { ok: false, output: `Comando não permitido: ${cmd}` };
  }

  const resolved = path.resolve(cwd);
  if (!resolved.startsWith(path.resolve(process.env.HOME ?? '/home'))) {
    return { ok: false, output: 'projectPath deve estar dentro do diretório home do usuário.' };
  }

  const fullCmd = ['iacmp', cmd, ...args].join(' ');
  try {
    const out = execSync(`${fullCmd} 2>&1`, {
      cwd: resolved,
      timeout: TIMEOUT_MS[cmd] ?? 120_000,
    }).toString().trim();
    return { ok: true, output: out };
  } catch (err: any) {
    const output = ((err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')).trim() || err.message;
    return { ok: false, output };
  }
}
