import { runIacmp } from './exec-iacmp.js';

type Provider = 'aws' | 'azure' | 'gcp' | 'terraform';

export function handleSynthProject(args: { projectPath: string; provider?: Provider }): string {
  const { projectPath, provider } = args;
  const providerArgs = provider ? ['--provider', provider] : [];
  const { ok, output } = runIacmp('synth', providerArgs, projectPath);
  return ok
    ? `✓ Synth concluído\n${output}`
    : `✗ Synth falhou:\n${output}`;
}

export function handleDeployProject(args: { projectPath: string; provider?: Provider }): string {
  const { projectPath, provider } = args;
  const providerArgs = provider ? ['--provider', provider] : [];
  const { ok, output } = runIacmp('deploy', [...providerArgs, '--yes'], projectPath);
  return ok
    ? `✓ Deploy concluído\n${output}`
    : `✗ Deploy falhou:\n${output}`;
}

export function handleDestroyProject(args: { projectPath: string; provider?: Provider }): string {
  const { projectPath, provider } = args;
  const providerArgs = provider ? ['--provider', provider] : [];
  const { ok, output } = runIacmp('destroy', [...providerArgs, '--force'], projectPath);
  return ok
    ? `✓ Destroy concluído\n${output}`
    : `✗ Destroy falhou:\n${output}`;
}
