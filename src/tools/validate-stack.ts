import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function handleValidateStack(args: { content: string; filename?: string; projectDir?: string }): string {
  const { content, filename = 'stack.ts', projectDir } = args;

  // Se projectDir fornecido, escreve o arquivo e roda synth no projeto real
  if (projectDir && fs.existsSync(projectDir)) {
    const filePath = path.join(projectDir, filename);
    const backup = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      const result = execSync(`iacmp synth --quiet 2>&1`, { cwd: projectDir, timeout: 30000 }).toString();
      return `✓ Synth válido\n${result}`;
    } catch (err: any) {
      return `✗ Erros de synth:\n${err.stdout?.toString() ?? err.message}`;
    } finally {
      if (backup !== null) fs.writeFileSync(filePath, backup, 'utf-8');
      else if (!args.filename) fs.unlinkSync(filePath);
    }
  }

  // Sem projectDir: validação estática básica (sem deploy)
  const issues: string[] = [];

  if (content.includes("resources: ['") && !content.includes("ref(")) {
    issues.push('resources contém string literal — deve usar ref(ConstructId, "Arn")');
  }
  if (/resources:\s*\[['"].*\/\*['"]/.test(content)) {
    issues.push('"ConstructId/*" em resources é inválido — IAM rejeita. Use ref() para ARN base.');
  }
  if (content.includes('.toString()') && content.includes('ref(')) {
    issues.push('ref().toString() produz "[object Object]" — nunca chame toString() em ref()');
  }
  if (content.includes('String(ref(')) {
    issues.push('String(ref(...)) produz "[object Object]" — nunca converta ref() para string');
  }
  if (/import\s+\w+\s+from\s+'ioredis'/.test(content)) {
    issues.push('import Redis from "ioredis" incorreto — use: import { Redis } from "ioredis"');
  }
  if (content.includes('aws-sdk') && !content.includes('@aws-sdk/')) {
    issues.push('aws-sdk (v2) detectado — use @aws-sdk/* (v3)');
  }
  if (content.includes('{ kind: \'iacmp:ref\'') || content.includes('{ kind: "iacmp:ref"')) {
    issues.push('Objeto ref interno exposto no código — use a função ref() do @iacmp/core');
  }

  if (issues.length === 0) return '✓ Sem problemas óbvios detectados (validação estática — para validação completa forneça projectDir)';
  return `✗ Problemas detectados:\n${issues.map(i => `- ${i}`).join('\n')}`;
}
