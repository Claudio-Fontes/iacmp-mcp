// Teste de integração do validate_stack autoritativo (roda o `iacmp synth` real).
// Requer o CLI `iacmp` no PATH — pula com exit 0 se ausente (ambiente sem CLI).
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';

try {
  execSync('iacmp --version', { stdio: 'pipe' });
} catch {
  console.log('SKIP: CLI `iacmp` não está no PATH — teste de integração ignorado.');
  process.exit(0);
}

const { handleValidateStack } = await import('../dist/tools/validate-stack.js');

const STACK = `import { Stack, Fn, Database, ref } from '@iacmp/core';
const stack = new Stack('api');
new Database.DynamoDB(stack, 'T', { partitionKey: { name: 'id', type: 'S' } });
new Fn.Lambda(stack, 'F', { runtime: 'nodejs20', handler: 'src/h.handler', code: 'dist/', environment: { B: ref('T','Name') } });
export default stack;`;

let pass = 0;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); pass++; };

// 1) stack válida → ✓ synth
check('stack válida passa (handler vira stub)', () => {
  const r = handleValidateStack({ content: STACK, provider: 'aws' });
  assert.ok(r.startsWith('✓'), `esperava ✓, veio: ${r.split('\n')[0]}`);
});

// 2) SDK da cloud errada (sem shim) → ✗ — catch que heurística de string não faria
check('@aws-sdk/client-sqs em Azure é barrado (validador real)', () => {
  const r = handleValidateStack({
    content: STACK, provider: 'azure',
    handlers: { 'src/h.ts': "import { SQSClient } from '@aws-sdk/client-sqs';\nexport const handler = async () => ({});" },
  });
  assert.ok(r.startsWith('✗'), 'deveria falhar');
  assert.ok(/client-sqs/.test(r), 'deveria citar o pacote sqs');
});

// 3) S3 shimmado em Azure → ✓ — reflete o pipeline real (o shim), não heurística
check('@aws-sdk/client-s3 em Azure passa (shim S3→Blob)', () => {
  const r = handleValidateStack({
    content: STACK, provider: 'azure',
    handlers: { 'src/h.ts': "import { S3Client } from '@aws-sdk/client-s3';\nexport const handler = async () => ({});" },
  });
  assert.ok(r.startsWith('✓'), `S3 é shimmado, deveria passar. veio: ${r.split('\n')[0]}`);
});

console.log(`\n${pass}/3 testes passaram`);
process.exit(pass === 3 ? 0 : 1);
