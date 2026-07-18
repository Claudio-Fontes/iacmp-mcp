import * as fs from 'fs';
import * as path from 'path';

const EXTENSIONS: Record<string, string[]> = {
  aws: ['.json'],
  azure: ['.bicep'],
  gcp: ['.tf.json', '.json'],
  terraform: ['.tf.json', '.json'],
};

export function handleReadSynthOutput(args: { projectPath: string; provider: string }): string {
  const { projectPath, provider } = args;

  const outDir = path.join(path.resolve(projectPath), 'synth-out', provider);
  if (!fs.existsSync(outDir)) {
    return `✗ Nenhum output de synth encontrado em synth-out/${provider}/. Rode synth_project primeiro.`;
  }

  const exts = EXTENSIONS[provider] ?? ['.json', '.bicep', '.tf.json'];
  const files = fs.readdirSync(outDir).filter(f => exts.some(e => f.endsWith(e)));

  if (files.length === 0) {
    return `✗ Nenhum arquivo de template encontrado em synth-out/${provider}/.`;
  }

  const sections = files.map(f => {
    const content = fs.readFileSync(path.join(outDir, f), 'utf-8');
    return `### ${f}\n\`\`\`\n${content}\n\`\`\``;
  });

  return `## synth-out/${provider}/ (${files.length} arquivo${files.length > 1 ? 's' : ''})\n\n${sections.join('\n\n')}`;
}
